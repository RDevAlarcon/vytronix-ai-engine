import http from "node:http";
import type { AddressInfo } from "node:net";
import { assertInferenceMemoryGate, getAvailableMemoryMb, MEMORY_GATE_FAILURE } from "./memory-gate";

export type MemoryGateProxyOptions = {
  upstream: string;
  measure?: () => number;
  log?: (message: string) => void;
};

export type MemoryGateProxyCounters = {
  received: number;
  allowed: number;
  blocked: number;
  forwarded: number;
};

export function createMemoryGateProxy(options: MemoryGateProxyOptions) {
  const counters: MemoryGateProxyCounters = { received: 0, allowed: 0, blocked: 0, forwarded: 0 };
  const measure = options.measure ?? getAvailableMemoryMb;
  const log = options.log ?? console.log;
  let sequence = 0;

  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Unsupported test proxy route" }));
      return;
    }

    const body = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => resolve(Buffer.concat(chunks)));
      request.on("error", reject);
    });

    const requestNumber = ++sequence;
    counters.received += 1;
    const gate = assertInferenceMemoryGate(measure, (message) => log(`MEMORY_GATE_PROXY request=${requestNumber} ${message}`));
    if (!gate.allowed) {
      counters.blocked += 1;
      response.writeHead(503, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { code: MEMORY_GATE_FAILURE, message: "Inference blocked by memory gate" } }));
      return;
    }

    counters.allowed += 1;
    counters.forwarded += 1;
    try {
      const upstreamResponse = await fetch(`${options.upstream}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": request.headers["content-type"] ?? "application/json",
          ...(request.headers.accept ? { accept: request.headers.accept } : {})
        },
        body: new Uint8Array(body)
      });
      const responseHeaders: Record<string, string> = {};
      const contentType = upstreamResponse.headers.get("content-type");
      if (contentType) responseHeaders["content-type"] = contentType;
      const contentLength = upstreamResponse.headers.get("content-length");
      if (contentLength) responseHeaders["content-length"] = contentLength;
      response.writeHead(upstreamResponse.status, responseHeaders);
      response.end(Buffer.from(await upstreamResponse.arrayBuffer()));
    } catch (error) {
      response.writeHead(502, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { code: "MEMORY_GATE_PROXY_UPSTREAM_ERROR", message: String(error) } }));
    }
  });

  return {
    server,
    counters,
    listen: (port = 0) => new Promise<number>((resolve) => server.listen(port, "127.0.0.1", () => resolve((server.address() as AddressInfo).port))),
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}
