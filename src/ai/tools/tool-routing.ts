import type { RagContext } from "@/ai/rag/rag-context";

export type ToolRoutingStrategy = "NATIVE" | "SELECTOR" | "TOOL_RESULT_RESPOND" | "LEGACY";

export const resolveToolRoutingStrategy = (params: {
  tools?: unknown[];
  ragContext?: RagContext;
  toolResult?: unknown;
  supportsNativeToolCalling: boolean;
}): ToolRoutingStrategy => {
  if (params.toolResult) return "TOOL_RESULT_RESPOND";
  if (!params.tools?.length) return "LEGACY";
  if (params.ragContext?.items.length) return "SELECTOR";
  return params.supportsNativeToolCalling ? "NATIVE" : "SELECTOR";
};
