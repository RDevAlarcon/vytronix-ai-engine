import { config } from "dotenv";
config();

const baseUrl = process.env.BENCHMARK_HTTP_BASE_URL ?? process.env.APP_BASE_URL ?? "http://127.0.0.1:3001";
const apiKey = process.env.BENCHMARK_HTTP_API_KEY ?? process.env.AI_ENGINE_API_KEY;
const headers: Record<string, string> = { "Content-Type": "application/json" };
if (apiKey) headers["X-API-Key"] = apiKey;

const main = async () => {
const health = await fetch(`${baseUrl}/api/health`);
if (!health.ok) throw new Error(`Health failed: HTTP ${health.status}`);
const run = await fetch(`${baseUrl}/api/agents/run`, { method: "POST", headers, body: JSON.stringify({ agent: "lead", mode: "standard", input: { leadMessage: "Somos una pyme y buscamos captar clientes con una landing.", knownServices: ["Landing pages"] } }) });
const payload = await run.json() as { success?: boolean; data?: { agent?: string; metadata?: { provider?: string; model?: string } }; error?: unknown };
if (!run.ok || payload.success !== true || payload.data?.agent !== "lead") throw new Error(`Agent smoke failed: HTTP ${run.status}`);
console.log(JSON.stringify({ baseUrl, health: health.status, agent: payload.data.agent, provider: payload.data.metadata?.provider, model: payload.data.metadata?.model }));
};

void main();
