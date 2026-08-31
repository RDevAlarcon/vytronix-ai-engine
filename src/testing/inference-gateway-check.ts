import assert from "node:assert/strict";
import http from "node:http";
import { createInferenceGateway } from "@/ai/runtime/inference-gateway/gateway";
import type { MemoryGateResult } from "@/ai/runtime/memory-gate";
import type { ThermalGateResult } from "@/ai/runtime/thermal-gate";

const payload = Buffer.from(JSON.stringify({ model: "test-model", messages: [{ role: "user", content: "hello" }], temperature: 0, max_tokens: 16 }));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const allowGate = {
  check: async (): Promise<MemoryGateResult> => ({ allowed: true, availableMb: 2500, thresholdMb: 2000, reason: "ok" })
};

const denyGate = (reason: "insufficient_memory" | "measurement_failed") => ({
  check: async (): Promise<MemoryGateResult> => ({ allowed: false, availableMb: reason === "insufficient_memory" ? 1999 : null, thresholdMb: 2000, reason })
});

const allowThermal = {
  waitUntilSafe: async (): Promise<ThermalGateResult> => ({
    allowed: true,
    temperatureC: 55,
    startThresholdC: 65,
    resumeThresholdC: 60,
    hardThresholdC: 70,
    waitedMs: 0,
    reason: "ok"
  })
};

const thermalResult = (allowed: boolean, reason: ThermalGateResult["reason"]): ThermalGateResult => ({
  allowed,
  temperatureC: allowed ? 59 : 66,
  startThresholdC: 65,
  resumeThresholdC: 60,
  hardThresholdC: 70,
  waitedMs: allowed ? 10 : 60,
  reason
});

function createFetch(status = 200, body: unknown = { choices: [{ finish_reason: "stop" }], usage: { total_tokens: 1 } }) {
  const calls: { input: string; init: RequestInit }[] = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "x-upstream": "fake" } });
  };
  return { calls, fetchImpl };
}

function bodyBytes(body: BodyInit | null | undefined): Buffer {
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body === "string") return Buffer.from(body);
  throw new Error("Unexpected request body type");
}

async function withGateway<T>(gateway: ReturnType<typeof createInferenceGateway>, test: (port: number) => Promise<T>): Promise<T> {
  const port = await gateway.listen(0);
  try {
    return await test(port);
  } finally {
    await gateway.close();
  }
}

function request(port: number, options: { method?: string; path?: string; body?: Buffer; abortAfterMs?: number; label?: string; contentType?: string; spoofedFor?: string } = {}): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  const body = options.body ?? (options.method === "GET" ? undefined : payload);
  const headers: Record<string, string | number> = {};
  if (body) {
    headers["content-type"] = options.contentType ?? "application/json";
    headers["content-length"] = body.length;
  }
  if (options.spoofedFor) headers["x-forwarded-for"] = options.spoofedFor;

  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: options.path ?? "/v1/chat/completions",
      method: options.method ?? "POST",
      headers
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), headers: response.headers }));
    });
    req.on("error", (error) => reject(new Error(`${options.label ?? "request"} failed: ${String(error)}`)));
    if (options.abortAfterMs !== undefined) {
      setTimeout(() => {
        reject(new Error(`${options.label ?? "request"} aborted by test`));
        req.destroy();
      }, options.abortAfterMs);
    }
    req.end(body);
  });
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await flush();
  }
  throw new Error("Timed out waiting for test condition");
}

async function main() {
  const healthGateway = createInferenceGateway({}, { memoryGate: allowGate, fetch: async () => { throw new Error("health should not call upstream"); }, logger: {} });
  await withGateway(healthGateway, async (port) => {
    const health = await request(port, { method: "GET", path: "/health", label: "health" });
    assert.equal(health.status, 200);
    const healthBody = JSON.parse(health.body) as { queue: unknown; limits: Record<string, number>; counters: Record<string, number> };
    assert.deepEqual(healthBody.queue, { active: 0, depth: 0 });
    assert.deepEqual(healthBody.limits, { contextSizeTokens: 2048, maxInputEstimatedTokens: 1200, maxCompletionTokens: 550 });
    assert.equal(healthBody.counters.completed, 0);
    assert.equal((await request(port, { method: "GET", path: "/missing", label: "missing" })).status, 404);
    const method = await request(port, { method: "GET", label: "method" });
    assert.equal(method.status, 405);
    assert.equal(method.headers.allow, "POST");
  });

  const allowed = createFetch();
  const gateway = createInferenceGateway({ upstreamUrl: "http://upstream.test", bodyLimitBytes: 1024 }, { memoryGate: allowGate, thermalGate: allowThermal, fetch: allowed.fetchImpl, logger: {} });
  await withGateway(gateway, async (port) => {
    const result = await request(port, { label: "allowed" });
    assert.equal(result.status, 200);
    assert.equal(result.headers["x-upstream"], "fake");
    assert.equal(allowed.calls.length, 1);
    assert.equal(allowed.calls[0]?.input, "http://upstream.test/v1/chat/completions");
    assert.deepEqual(bodyBytes(allowed.calls[0]?.init.body), payload);
    assert.equal(gateway.counters.forwarded, 1);
  });

  for (const [requested, forwarded] of [[200, 200], [550, 550], [551, 550], [5000, 550], [undefined, 550]] as const) {
    const tokenFetch = createFetch();
    await withGateway(createInferenceGateway({ maxCompletionTokens: 550 }, { memoryGate: allowGate, thermalGate: allowThermal, fetch: tokenFetch.fetchImpl, logger: {} }), async (port) => {
      const body = requested === undefined
        ? Buffer.from(JSON.stringify({ model: "test-model", messages: [{ role: "user", content: "hello" }] }))
        : Buffer.from(JSON.stringify({ model: "test-model", messages: [{ role: "user", content: "hello" }], max_tokens: requested }));
      assert.equal((await request(port, { body, label: `tokens-${String(requested)}` })).status, 200);
      const upstreamBody = JSON.parse(bodyBytes(tokenFetch.calls[0]?.init.body).toString("utf8")) as Record<string, unknown>;
      assert.equal(upstreamBody.max_tokens, forwarded);
      assert.equal(upstreamBody.model, "test-model");
      assert.deepEqual(upstreamBody.messages, [{ role: "user", content: "hello" }]);
    });
  }

  for (const invalid of ["550", -1, 0, 1.5]) {
    const invalidFetch = createFetch();
    await withGateway(createInferenceGateway({}, { memoryGate: allowGate, thermalGate: allowThermal, fetch: invalidFetch.fetchImpl, logger: {} }), async (port) => {
      const result = await request(port, { body: Buffer.from(JSON.stringify({ model: "test-model", messages: [{ role: "user", content: "hello" }], max_tokens: invalid })), label: `invalid-tokens-${String(invalid)}` });
      assert.equal(result.status, 400);
      assert.equal(invalidFetch.calls.length, 0);
    });
  }

  const invalidJsonFetch = createFetch();
  await withGateway(createInferenceGateway({}, { memoryGate: allowGate, thermalGate: allowThermal, fetch: invalidJsonFetch.fetchImpl, logger: {} }), async (port) => {
    assert.equal((await request(port, { body: Buffer.from("{"), label: "invalid-json" })).status, 400);
    assert.equal((await request(port, { body: Buffer.from("{}"), contentType: "text/plain", label: "invalid-content-type" })).status, 400);
    assert.equal(invalidJsonFetch.calls.length, 0);
  });

  const inputRejectedFetch = createFetch();
  let inputRejectedMemoryCalls = 0;
  let inputRejectedThermalCalls = 0;
  const inputRejectedGateway = createInferenceGateway({ maxInputEstimatedTokens: 2, maxCompletionTokens: 1, contextSizeTokens: 10, maxMessageChars: 100 }, {
    memoryGate: { check: async () => { inputRejectedMemoryCalls += 1; return allowGate.check(); } },
    thermalGate: { waitUntilSafe: async () => { inputRejectedThermalCalls += 1; return allowThermal.waitUntilSafe(); } },
    fetch: inputRejectedFetch.fetchImpl,
    logger: {}
  });
  await withGateway(inputRejectedGateway, async (port) => {
    const result = await request(port, { body: Buffer.from(JSON.stringify({ model: "test-model", messages: [{ role: "system", content: "abc" }, { role: "user", content: "defg" }] })), label: "input-too-large" });
    assert.equal(result.status, 413);
    assert.equal(JSON.parse(result.body).error.code, "INFERENCE_INPUT_TOO_LARGE");
    assert.equal(inputRejectedGateway.counters.inputRejected, 1);
    assert.equal(inputRejectedGateway.counters.received, 0);
    assert.equal(inputRejectedGateway.counters.completed, 0);
    assert.equal(inputRejectedMemoryCalls, 0);
    assert.equal(inputRejectedThermalCalls, 0);
    assert.equal(inputRejectedFetch.calls.length, 0);
  });

  const unsupportedContentFetch = createFetch();
  await withGateway(createInferenceGateway({}, { memoryGate: allowGate, thermalGate: allowThermal, fetch: unsupportedContentFetch.fetchImpl, logger: {} }), async (port) => {
    const result = await request(port, { body: Buffer.from(JSON.stringify({ messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }] })), label: "unsupported-content" });
    assert.equal(result.status, 400);
    assert.equal(unsupportedContentFetch.calls.length, 0);
  });

  const limitedFetch = createFetch();
  let limitedMemoryCalls = 0;
  let limitedThermalCalls = 0;
  const limitedGateway = createInferenceGateway({ rateLimitMaxRequests: 1, globalRateLimitMaxRequests: 10, rateLimitWindowMs: 1000 }, {
    memoryGate: { check: async () => { limitedMemoryCalls += 1; return allowGate.check(); } },
    thermalGate: { waitUntilSafe: async () => { limitedThermalCalls += 1; return allowThermal.waitUntilSafe(); } },
    fetch: limitedFetch.fetchImpl,
    logger: {}
  });
  await withGateway(limitedGateway, async (port) => {
    assert.equal((await request(port, { label: "rate-1" })).status, 200);
    const blocked = await request(port, { label: "rate-2", spoofedFor: "203.0.113.9" });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers["retry-after"], "1");
    assert.equal(limitedGateway.counters.rateLimited, 1);
    assert.equal(limitedGateway.getSnapshot().depth, 0);
    assert.equal(limitedMemoryCalls, 1);
    assert.equal(limitedThermalCalls, 1);
    assert.equal(limitedFetch.calls.length, 1);
  });

  const globalLimited = createFetch();
  const globalGateway = createInferenceGateway({ rateLimitMaxRequests: 10, globalRateLimitMaxRequests: 1, rateLimitWindowMs: 1000 }, { memoryGate: allowGate, thermalGate: allowThermal, fetch: globalLimited.fetchImpl, logger: {} });
  await withGateway(globalGateway, async (port) => {
    assert.equal((await request(port, { label: "global-1" })).status, 200);
    assert.equal((await request(port, { label: "global-2" })).status, 429);
    assert.equal(globalGateway.counters.globalRateLimited, 1);
    assert.equal(globalLimited.calls.length, 1);
  });

  const nonOk = createFetch(429, { error: "model busy" });
  await withGateway(createInferenceGateway({ upstreamUrl: "http://upstream.test" }, { memoryGate: allowGate, thermalGate: allowThermal, fetch: nonOk.fetchImpl, logger: {} }), async (port) => {
    const result = await request(port, { label: "non-ok" });
    assert.equal(result.status, 429);
    assert.equal(JSON.parse(result.body).error, "model busy");
  });

  for (const reason of ["insufficient_memory", "measurement_failed"] as const) {
    const blocked = createFetch();
    let thermalCalls = 0;
    await withGateway(createInferenceGateway({}, {
      memoryGate: denyGate(reason),
      thermalGate: { waitUntilSafe: async () => { thermalCalls += 1; return thermalResult(true, "ok"); } },
      fetch: blocked.fetchImpl,
      logger: {}
    }), async (port) => {
      const result = await request(port, { label: `memory-${reason}` });
      assert.equal(result.status, 503);
      assert.equal(blocked.calls.length, 0);
      assert.equal(thermalCalls, 0);
    });
  }

  const thermalDeniedFetch = createFetch();
  await withGateway(createInferenceGateway({}, {
    memoryGate: allowGate,
    thermalGate: { waitUntilSafe: async () => thermalResult(false, "thermal_timeout") },
    fetch: thermalDeniedFetch.fetchImpl,
    logger: {}
  }), async (port) => {
    const result = await request(port, { label: "thermal-deny" });
    assert.equal(result.status, 503);
    assert.equal(result.headers["retry-after"], "5");
    assert.equal(thermalDeniedFetch.calls.length, 0);
  });

  const thermalRecoveryRelease = deferred<ThermalGateResult>();
  const thermalRecoveryFetch = createFetch();
  await withGateway(createInferenceGateway({}, {
    memoryGate: allowGate,
    thermalGate: { waitUntilSafe: async () => thermalRecoveryRelease.promise },
    fetch: thermalRecoveryFetch.fetchImpl,
    logger: {}
  }), async (port) => {
    const pending = request(port, { label: "thermal-recovery" });
    await flush();
    assert.equal(thermalRecoveryFetch.calls.length, 0);
    thermalRecoveryRelease.resolve(thermalResult(true, "cooled_down"));
    assert.equal((await pending).status, 200);
    assert.equal(thermalRecoveryFetch.calls.length, 1);
  });

  const oversizeFetch = createFetch();
  const oversizeGateway = createInferenceGateway({ bodyLimitBytes: 4 }, { memoryGate: allowGate, thermalGate: allowThermal, fetch: oversizeFetch.fetchImpl, logger: {} });
  await withGateway(oversizeGateway, async (port) => {
    const result = await request(port, { label: "oversize" });
    assert.equal(result.status, 413);
    assert.equal(oversizeFetch.calls.length, 0);
    assert.deepEqual(oversizeGateway.getSnapshot(), { active: 0, depth: 0 });
  });

  const unavailableGateway = createInferenceGateway({}, { memoryGate: allowGate, thermalGate: allowThermal, fetch: async () => { throw new Error("offline"); }, logger: {} });
  await withGateway(unavailableGateway, async (port) => {
    assert.equal((await request(port, { label: "unavailable" })).status, 502);
  });

  const timeoutGateway = createInferenceGateway({ upstreamTimeoutMs: 1 }, {
    memoryGate: allowGate,
    thermalGate: allowThermal,
    fetch: async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    }),
    logger: {}
  });
  await withGateway(timeoutGateway, async (port) => {
    assert.equal((await request(port, { label: "timeout" })).status, 504);
  });

  const starts: string[] = [];
  const releases = [deferred<Response>(), deferred<Response>(), deferred<Response>()];
  let releaseIndex = 0;
  const fifoGateway = createInferenceGateway({ upstreamUrl: "http://upstream.test" }, {
    memoryGate: allowGate,
    thermalGate: allowThermal,
    fetch: async (_input, init) => {
      starts.push(String((JSON.parse(bodyBytes(init?.body).toString("utf8")) as { id: string }).id));
      const current = releases[releaseIndex++];
      if (!current) throw new Error("unexpected request");
      return current.promise;
    },
    logger: {}
  });
  await withGateway(fifoGateway, async (port) => {
    const a = request(port, { body: Buffer.from(JSON.stringify({ id: "A", messages: [{ role: "user", content: "A" }] })) });
    const b = request(port, { body: Buffer.from(JSON.stringify({ id: "B", messages: [{ role: "user", content: "B" }] })) });
    const c = request(port, { body: Buffer.from(JSON.stringify({ id: "C", messages: [{ role: "user", content: "C" }] })) });
    await waitFor(() => starts.length === 1);
    assert.deepEqual(fifoGateway.getSnapshot(), { active: 1, depth: 2 });
    releases[0]?.resolve(new Response("A", { status: 200 }));
    assert.equal((await a).status, 200);
    await flush();
    releases[1]?.resolve(new Response("B", { status: 200 }));
    assert.equal((await b).status, 200);
    await flush();
    releases[2]?.resolve(new Response("C", { status: 200 }));
    assert.equal((await c).status, 200);
    assert.deepEqual(starts, ["A", "B", "C"]);
  });

  const fullRelease = deferred<Response>();
  const fullGateway = createInferenceGateway({}, {
    memoryGate: allowGate,
    thermalGate: allowThermal,
    fetch: async () => fullRelease.promise,
    logger: {}
  });
  await withGateway(fullGateway, async (port) => {
    const requests = Array.from({ length: 7 }, () => request(port));
    await flush();
    const seventh = await requests[6];
    assert.equal(seventh?.status, 503);
    fullRelease.resolve(new Response("{}", { status: 200 }));
    await Promise.all(requests.slice(0, 6));
    assert.equal(fullGateway.counters.queueRejected, 1);
  });

  const queueTimeoutRelease = deferred<Response>();
  const queueTimeoutGateway = createInferenceGateway({ queueTimeoutMs: 1 }, {
    memoryGate: allowGate,
    thermalGate: allowThermal,
    fetch: async () => queueTimeoutRelease.promise,
    logger: {}
  });
  await withGateway(queueTimeoutGateway, async (port) => {
    const active = request(port);
    const waiting = request(port);
    await flush();
    assert.equal((await waiting).status, 503);
    queueTimeoutRelease.resolve(new Response("{}", { status: 200 }));
    assert.equal((await active).status, 200);
  });

  const queueDeadlineRelease = deferred<Response>();
  const queueDeadlineGateway = createInferenceGateway({ totalTimeoutMs: 10, queueTimeoutMs: 30000 }, {
    memoryGate: allowGate,
    thermalGate: allowThermal,
    fetch: async (_input, init) => new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      queueDeadlineRelease.promise.then(resolve, reject);
    }),
    logger: {}
  });
  await withGateway(queueDeadlineGateway, async (port) => {
    const active = request(port, { label: "total-active" });
    const waiting = request(port, { label: "total-waiting" });
    assert.equal((await active).status, 504);
    assert.equal((await waiting).status, 504);
    await flush();
    assert.deepEqual(queueDeadlineGateway.getSnapshot(), { active: 0, depth: 0 });
    assert.equal(queueDeadlineGateway.counters.totalTimeouts >= 2, true);
  });

  const thermalDeadlineFetch = createFetch();
  const thermalDeadlineGateway = createInferenceGateway({ totalTimeoutMs: 10 }, {
    memoryGate: allowGate,
    thermalGate: {
      waitUntilSafe: async (options: { signal?: AbortSignal } = {}) => new Promise<ThermalGateResult>((resolve) => {
        options.signal?.addEventListener("abort", () => resolve(thermalResult(false, "aborted")), { once: true });
      })
    },
    fetch: thermalDeadlineFetch.fetchImpl,
    logger: {}
  });
  await withGateway(thermalDeadlineGateway, async (port) => {
    const result = await request(port, { label: "total-thermal" });
    assert.equal(result.status, 504);
    assert.equal(thermalDeadlineFetch.calls.length, 0);
    assert.deepEqual(thermalDeadlineGateway.getSnapshot(), { active: 0, depth: 0 });
  });

  const upstreamDeadlineGateway = createInferenceGateway({ totalTimeoutMs: 10, upstreamTimeoutMs: 90000 }, {
    memoryGate: allowGate,
    thermalGate: allowThermal,
    fetch: async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    }),
    logger: {}
  });
  await withGateway(upstreamDeadlineGateway, async (port) => {
    const result = await request(port, { label: "total-upstream" });
    assert.equal(result.status, 504);
    assert.equal(upstreamDeadlineGateway.counters.totalTimeouts, 1);
    await flush();
    assert.deepEqual(upstreamDeadlineGateway.getSnapshot(), { active: 0, depth: 0 });
  });

  const thermalAbortGate = {
    waitUntilSafe: async () => thermalResult(false, "aborted")
  };
  const thermalAbortGateway = createInferenceGateway({}, {
    memoryGate: allowGate,
    thermalGate: thermalAbortGate,
    fetch: async () => { throw new Error("thermal abort should not call upstream"); },
    logger: {}
  });
  await withGateway(thermalAbortGateway, async (port) => {
    assert.equal((await request(port, { label: "thermal-abort" })).status, 499);
    await flush();
    assert.deepEqual(thermalAbortGateway.getSnapshot(), { active: 0, depth: 0 });
  });

  const cooldownRelease = deferred<ThermalGateResult>();
  let cooldownThermalCalls = 0;
  const cooldownStarts: string[] = [];
  const cooldownGateway = createInferenceGateway({}, {
    memoryGate: allowGate,
    thermalGate: { waitUntilSafe: async () => { cooldownThermalCalls += 1; return cooldownRelease.promise; } },
    fetch: async (_input, init) => {
      cooldownStarts.push(String((JSON.parse(bodyBytes(init?.body).toString("utf8")) as { id: string }).id));
      return new Response("{}", { status: 200 });
    },
    logger: {}
  });
  await withGateway(cooldownGateway, async (port) => {
    const a = request(port, { body: Buffer.from(JSON.stringify({ id: "A", messages: [{ role: "user", content: "A" }] })), label: "cooldown-a" });
    const b = request(port, { body: Buffer.from(JSON.stringify({ id: "B", messages: [{ role: "user", content: "B" }] })), label: "cooldown-b" });
    await waitFor(() => cooldownThermalCalls === 1);
    assert.deepEqual(cooldownGateway.getSnapshot(), { active: 1, depth: 1 });
    assert.deepEqual(cooldownStarts, []);
    cooldownRelease.resolve(thermalResult(true, "cooled_down"));
    assert.equal((await a).status, 200);
    await waitFor(() => cooldownStarts.length === 2);
    assert.equal((await b).status, 200);
    assert.deepEqual(cooldownStarts, ["A", "B"]);
  });
  console.log("Inference gateway checks passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
