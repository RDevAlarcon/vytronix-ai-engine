import { createMemoryGateProxy } from "./memory-gate-proxy";

const proxy = createMemoryGateProxy({ upstream: process.env.E5B_PROXY_UPSTREAM ?? "http://192.168.1.95:8081" });
const port = Number(process.env.E5B_PROXY_PORT ?? "18081");

proxy.server.listen(port, "127.0.0.1", () => {
  console.log(`E5B_MEMORY_PROXY_READY host=127.0.0.1 port=${port} upstream=${process.env.E5B_PROXY_UPSTREAM ?? "http://192.168.1.95:8081"}`);
});

const close = async () => {
  await proxy.close();
  console.log(`E5B_MEMORY_PROXY_STOPPED received=${proxy.counters.received} allowed=${proxy.counters.allowed} blocked=${proxy.counters.blocked} forwarded=${proxy.counters.forwarded}`);
};

process.once("SIGINT", () => void close().then(() => process.exit(0)));
process.once("SIGTERM", () => void close().then(() => process.exit(0)));
