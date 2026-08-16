import { config } from "dotenv";

async function main() {
  config();
  const provider = process.argv[2];
  if (provider === "lmstudio" || provider === "ollama") {
    process.env.LLM_PROVIDER = provider;
  }

  const { llmService } = await import("@/ai/llm/llm.service");
  const startedAt = Date.now();
  const result = await llmService.chat({
    messages: [
      { role: "system", content: "Reply with one short sentence." },
      { role: "user", content: "Confirm that the configured provider is reachable." }
    ],
    maxTokens: 80,
    temperature: 0
  });

  console.log(JSON.stringify({ provider: result.provider, model: result.model, durationMs: Date.now() - startedAt, usage: result.usage }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "LLM integration test failed");
  process.exitCode = 1;
});
