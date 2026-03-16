import { guardrailCases, type GuardrailCase } from "./guardrail-cases";

type AgentName = "lead" | "landing" | "proposal" | "support";
type AgentExecutionMode = "standard" | "fast";

type RunApiSuccess = {
  success: true;
  data: {
    runId: string;
    agent: AgentName;
    parsedOutput: unknown;
    rawOutput: string;
    metadata: {
      mode: AgentExecutionMode;
      model: string;
      provider: string;
      attemptCount: number;
      durationMs: number;
      usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
      };
    };
  };
};

type RunApiError = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

type ScopeFlags = {
  is_in_scope: boolean;
  out_of_scope_reason: string | null;
  safe_reply: string;
};

type CaseResult = {
  id: string;
  agent: AgentName;
  ok: boolean;
  reason: string;
  durationMs?: number;
  attemptCount?: number;
};

const API_BASE_URL = process.env.APP_BASE_URL ?? "http://127.0.0.1:3001";
const DEFAULT_REQUEST_TIMEOUT_MS = 90_000;
const API_KEY = process.env.ENGINE_API_KEY ?? process.env.INTERNAL_API_KEY ?? "";

function hasScopeFlags(value: unknown): value is ScopeFlags {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.is_in_scope === "boolean" &&
    (typeof record.out_of_scope_reason === "string" || record.out_of_scope_reason === null) &&
    typeof record.safe_reply === "string"
  );
}

function parseArgValue(flag: string): string | null {
  const index = process.argv.findIndex((arg) => arg === flag);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

function parseModeArg(): AgentExecutionMode {
  const mode = parseArgValue("--mode");
  if (mode === "fast" || mode === "standard") {
    return mode;
  }
  return "standard";
}

function parseAgentFilterArg(): AgentName | null {
  const agent = parseArgValue("--agent");
  if (agent === "lead" || agent === "landing" || agent === "proposal" || agent === "support") {
    return agent;
  }
  return null;
}

function parseTimeoutArg(): number {
  const timeoutFromArg = parseArgValue("--timeout-ms");
  const timeoutFromEnv = process.env.GUARDRAIL_TIMEOUT_MS ?? null;
  const raw = timeoutFromArg ?? timeoutFromEnv;
  if (!raw) {
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1000) {
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }
  return parsed;
}

async function runCase(testCase: GuardrailCase, mode: AgentExecutionMode, timeoutMs: number): Promise<CaseResult> {
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/agents/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(API_KEY ? { "x-api-key": API_KEY } : {})
      },
      body: JSON.stringify({
        agent: testCase.agent,
        input: testCase.input,
        mode
      }),
      signal: abortController.signal
    });
  } catch (error) {
    const isAbortError = error instanceof Error && error.name === "AbortError";
    return {
      id: testCase.id,
      agent: testCase.agent,
      ok: false,
      reason: isAbortError ? `Request timeout after ${timeoutMs}ms` : `Network error: ${String(error)}`
    };
  } finally {
    clearTimeout(timeoutHandle);
  }

  const body = (await response.json()) as RunApiSuccess | RunApiError;
  if (!response.ok) {
    const errorBody = body as RunApiError;
    return {
      id: testCase.id,
      agent: testCase.agent,
      ok: false,
      reason: `HTTP ${response.status} - ${errorBody.error?.code ?? "UNKNOWN_ERROR"}`
    };
  }

  if (!body.success) {
    return {
      id: testCase.id,
      agent: testCase.agent,
      ok: false,
      reason: `API error - ${(body as RunApiError).error.code}`
    };
  }

  const parsedOutput = body.data.parsedOutput;
  if (!hasScopeFlags(parsedOutput)) {
    return {
      id: testCase.id,
      agent: testCase.agent,
      ok: false,
      reason: "parsedOutput missing scope flags",
      durationMs: body.data.metadata.durationMs,
      attemptCount: body.data.metadata.attemptCount
    };
  }

  if (testCase.expectation === "in_scope" && parsedOutput.is_in_scope !== true) {
    return {
      id: testCase.id,
      agent: testCase.agent,
      ok: false,
      reason: `Expected in_scope=true, got false (${parsedOutput.out_of_scope_reason ?? "no reason"})`,
      durationMs: body.data.metadata.durationMs,
      attemptCount: body.data.metadata.attemptCount
    };
  }

  if (testCase.expectation === "out_scope" && parsedOutput.is_in_scope !== false) {
    return {
      id: testCase.id,
      agent: testCase.agent,
      ok: false,
      reason: "Expected in_scope=false, got true",
      durationMs: body.data.metadata.durationMs,
      attemptCount: body.data.metadata.attemptCount
    };
  }

  if (testCase.expectation === "out_scope" && parsedOutput.safe_reply.trim().length === 0) {
    return {
      id: testCase.id,
      agent: testCase.agent,
      ok: false,
      reason: "safe_reply is empty for out-of-scope case",
      durationMs: body.data.metadata.durationMs,
      attemptCount: body.data.metadata.attemptCount
    };
  }

  return {
    id: testCase.id,
    agent: testCase.agent,
    ok: true,
    reason: "ok",
    durationMs: body.data.metadata.durationMs,
    attemptCount: body.data.metadata.attemptCount
  };
}

async function main() {
  const mode = parseModeArg();
  const agentFilter = parseAgentFilterArg();
  const timeoutMs = parseTimeoutArg();
  const selectedCases = agentFilter
    ? guardrailCases.filter((testCase) => testCase.agent === agentFilter)
    : guardrailCases;

  if (selectedCases.length === 0) {
    console.error("No hay casos para ejecutar con el filtro actual.");
    process.exit(1);
  }

  console.log(
    `Running guardrail suite: ${selectedCases.length} cases | mode=${mode} | base=${API_BASE_URL} | timeout=${timeoutMs}ms`
  );

  const results: CaseResult[] = [];
  for (const testCase of selectedCases) {
    try {
      const result = await runCase(testCase, mode, timeoutMs);
      results.push(result);
      const marker = result.ok ? "PASS" : "FAIL";
      console.log(
        `${marker} [${testCase.agent}] ${testCase.id} - ${testCase.description} | ${result.reason} | duration=${result.durationMs ?? "-"}ms | attempts=${result.attemptCount ?? "-"}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        id: testCase.id,
        agent: testCase.agent,
        ok: false,
        reason: `Unhandled error: ${message}`
      });
      console.log(`FAIL [${testCase.agent}] ${testCase.id} - ${testCase.description} | Unhandled error: ${message}`);
    }
  }

  const failed = results.filter((result) => !result.ok);
  const passed = results.length - failed.length;

  console.log("");
  console.log(`Summary: ${passed}/${results.length} passed, ${failed.length} failed.`);

  if (failed.length > 0) {
    console.log("Failed cases:");
    for (const failure of failed) {
      console.log(`- ${failure.id} (${failure.agent}): ${failure.reason}`);
    }
    process.exit(1);
  }
}

void main();
