import { classifyAgentScope } from "@/ai/agents/intent.classifier";
import { guardrailCases } from "./guardrail-cases";

type CaseResult = {
  id: string;
  agent: string;
  ok: boolean;
  reason: string;
};

function main() {
  const results: CaseResult[] = guardrailCases.map((testCase) => {
    const classification = classifyAgentScope(testCase.agent, testCase.input);
    const expectedInScope = testCase.expectation === "in_scope";
    const ok = classification.inScope === expectedInScope;

    return {
      id: testCase.id,
      agent: testCase.agent,
      ok,
      reason: ok
        ? `ok (${classification.reason})`
        : `expected=${expectedInScope}, got=${classification.inScope} (${classification.reason})`
    };
  });

  for (const result of results) {
    const marker = result.ok ? "PASS" : "FAIL";
    console.log(`${marker} [${result.agent}] ${result.id} - ${result.reason}`);
  }

  const failed = results.filter((result) => !result.ok);
  console.log("");
  console.log(`Summary: ${results.length - failed.length}/${results.length} passed, ${failed.length} failed.`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main();

