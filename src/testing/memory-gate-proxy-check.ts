import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createMemoryGateProxy } from "./memory-gate-proxy";

const payload = Buffer.from(JSON.stringify({ model: "test-model", messages: [{ role: "user", content: "hello" }], temperature: 0, max_tokens: 550, response_format: { type: "json_schema", json_schema: { strict: true } } }));

async function main() {
  let upstreamCalls = 0;
  const upstream = http.createServer((request, response) => {
    upstreamCalls += 1;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      assert.deepEqual(Buffer.concat(chunks), payload);
      response.writeHead(201, { "content-type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }], usage: { total_tokens: 1 } }));
    });
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const upstreamPort = (upstream.address() as AddressInfo).port;
  const values = [2500, 2000, 1999, 0];
  const proxy = createMemoryGateProxy({ upstream: `http://127.0.0.1:${upstreamPort}`, measure: () => values.shift() ?? 1999, log: () => undefined });
  const proxyPort = await proxy.listen();
  const post = () => new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = http.request({ host: "127.0.0.1", port: proxyPort, path: "/v1/chat/completions", method: "POST", headers: { "content-type": "application/json" } }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", reject);
    request.end(payload);
  });
  const allowed1 = await post();
  const allowed2 = await post();
  const blocked1 = await post();
  const blocked2 = await post();
  assert.equal(allowed1.status, 201);
  assert.equal(JSON.parse(allowed1.body).choices[0].finish_reason, "stop");
  assert.equal(allowed2.status, 201);
  assert.equal(blocked1.status, 503);
  assert.equal(blocked2.status, 503);
  assert.equal(upstreamCalls, 2);
  assert.deepEqual(proxy.counters, { received: 4, allowed: 2, blocked: 2, forwarded: 2 });
  await proxy.close();
  await new Promise<void>((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
  console.log("Memory gate proxy checks passed.");
}

void main();
