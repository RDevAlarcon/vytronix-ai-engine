# Benchmark harness

The benchmark is an opt-in internal tool. It executes the same versioned
cases through `runAgent`, therefore agents, prompts, scope policy, Zod output
validation and retry behavior are shared with normal execution. It does not
write PostgreSQL rows and its JSON results are ignored by Git.

Examples:

```bash
npm run benchmark:lmstudio -- --model qwen2.5-7b-instruct
npm run benchmark:ollama -- --model <model-name>
npm run benchmark -- --agents lead,support --repetitions 2 --warmup 1
npm run test:http:agents
```

Provider availability is required before running a real benchmark. The
runner does not start runtimes or download models. A case failure is recorded
and the suite continues; invalid configuration or an invalid dataset aborts.

Warmups are excluded from summary metrics. Repetitions are included as
independent observations. Results are written to `benchmarks/results/`.

TTFT is `null` because the current provider adapter uses non-streaming
requests. Tokens/second is calculated only when completion tokens are present:

```text
outputTokens / (durationMs / 1000)
```

Duration is measured around the internal agent execution and includes provider
request plus parsing/validation/retry overhead. It is not a pure decoder
throughput measurement.

The harness records optional resource metadata fields only as future room;
host CPU/RAM/temperature must be measured externally.
