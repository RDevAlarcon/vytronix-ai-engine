import assert from "node:assert/strict";
import { assertRagOnlyFixture, buildRagOnlySmokeRequest, RAG_ONLY_GROUNDED_FACT } from "./rag-only-fixture";

const parsed = assertRagOnlyFixture();
const smoke = buildRagOnlySmokeRequest();
assert.equal(smoke.url, "http://127.0.0.1:3001/api/agents/run");
assert.equal(smoke.body.ragContext.items[0]?.content.includes(RAG_ONLY_GROUNDED_FACT), true);
assert.equal("tools" in smoke.body, false);
console.log("RAG-only fixture checks passed.");
console.log(`RAG_ONLY_FIXTURE items=${parsed.items.length} tools=none runtime=not-started`);
