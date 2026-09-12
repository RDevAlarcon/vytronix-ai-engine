import { z } from "zod";
import type { ToolDefinition } from "@/ai/tools/tool-contract";
import { validateToolCall } from "@/ai/tools/tool-contract";
import { executeStructuredOutput } from "@/ai/structured-output/structured-output";
import { llmService } from "@/ai/llm/llm.service";
import { AppError } from "@/lib/errors";

export type ToolArgumentExtractionResult = {
  status: "SUCCESS" | "MISSING_INFORMATION" | "INVALID";
  arguments?: Record<string, unknown>;
  missing?: string[];
  attempts: number;
  repairAttempt: boolean;
  durationMs: number;
};

const EXTRACTION_DESCRIPTION_MAX_CHARS = 140;
const EXTRACTION_MAX_FIELDS = 20;
const EXTRACTION_ENUM_MAX_ITEMS = 8;
const EXTRACTION_ENUM_STRING_MAX_CHARS = 60;
const INTERNAL_SCHEMA_PROPERTY_NAMES = new Set([
  "canonical",
  "canonicalSchema",
  "execution",
  "executionSchema",
  "idField",
  "labelField",
  "lookup",
  "metadata",
  "provider",
  "resolver",
  "scopedBy",
  "tenantMetadata",
  "xEntityReference"
]);

type CompactExtractionType = "string" | "number" | "integer" | "boolean" | "array" | "object" | "unknown";

export type CompactExtractionField = {
  name: string;
  type: CompactExtractionType;
  required: boolean;
  description?: string;
  enum?: unknown[];
  itemType?: CompactExtractionType;
};

export type CompactExtractionDescriptor = {
  type: "object";
  fields: CompactExtractionField[];
};

type SchemaLike = {
  type?: unknown;
  properties?: unknown;
  required?: unknown;
  items?: unknown;
  enum?: unknown;
  title?: unknown;
  description?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const compactText = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length <= EXTRACTION_DESCRIPTION_MAX_CHARS
    ? normalized
    : `${normalized.slice(0, EXTRACTION_DESCRIPTION_MAX_CHARS - 1)}…`;
};

const compactSchemaType = (schema: SchemaLike): CompactExtractionType => {
  if (schema.type === "string" || schema.type === "number" || schema.type === "integer" || schema.type === "boolean" || schema.type === "array" || schema.type === "object") return schema.type;
  if (isRecord(schema.properties)) return "object";
  if (isRecord(schema.items)) return "array";
  return "unknown";
};

const compactEnum = (value: unknown): unknown[] | undefined => {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const items = value.slice(0, EXTRACTION_ENUM_MAX_ITEMS).flatMap((item) => {
    if (typeof item === "string") return [item.length <= EXTRACTION_ENUM_STRING_MAX_CHARS ? item : `${item.slice(0, EXTRACTION_ENUM_STRING_MAX_CHARS - 1)}…`];
    if (typeof item === "number" || typeof item === "boolean" || item === null) return [item];
    return [];
  });
  return items.length ? items : undefined;
};

const isInternalSchemaProperty = (name: string): boolean => INTERNAL_SCHEMA_PROPERTY_NAMES.has(name) || /^x[A-Z_-]/.test(name);

// A declared sibling <entity>Ref is the extraction alternative to <entity>Id.
// Project a copy: the caller's execution schema and selector catalog stay intact.
export const buildExtractionSchema = (inputSchema: ToolDefinition["inputSchema"]): ToolDefinition["inputSchema"] => {
  const properties = { ...inputSchema.properties };
  const required = new Set(inputSchema.required ?? []);
  for (const name of Object.keys(properties)) {
    const reference = name.endsWith("Id") ? `${name.slice(0, -2)}Ref` : undefined;
    if (reference && properties[reference]?.type === "string") {
      delete properties[name];
      if (required.delete(name)) required.add(reference);
    }
  }
  return { ...inputSchema, properties, required: [...required], additionalProperties: false };
};

// Date expressions are canonicalized deterministically from the current turn
// before the original tool schema performs its final strict ISO validation.
export const buildPreGroundingExtractionSchema = (inputSchema: ToolDefinition["inputSchema"]): ToolDefinition["inputSchema"] => {
  const extractionSchema = buildExtractionSchema(inputSchema);
  const properties = Object.fromEntries(Object.entries(extractionSchema.properties ?? {}).map(([name, property]) => [
    name,
    property.format === "date" ? { ...property, format: undefined } : property
  ]));
  const temporalFields = new Set(Object.entries(extractionSchema.properties ?? {})
    .filter(([, property]) => property.format === "date")
    .map(([name]) => name));
  return {
    ...extractionSchema,
    properties,
    required: (extractionSchema.required ?? []).filter((name) => !temporalFields.has(name)),
    additionalProperties: false
  };
};

export const buildCompactExtractionDescriptor = (inputSchema: ToolDefinition["inputSchema"]): CompactExtractionDescriptor => {
  const root = inputSchema as SchemaLike;
  const properties = isRecord(root.properties) ? root.properties : {};
  const required = new Set(Array.isArray(root.required) ? root.required.filter((field): field is string => typeof field === "string") : []);
  const fields: CompactExtractionField[] = [];

  for (const [name, property] of Object.entries(properties)) {
    if (fields.length >= EXTRACTION_MAX_FIELDS || isInternalSchemaProperty(name) || !isRecord(property)) continue;
    const schema = property as SchemaLike;
    const field: CompactExtractionField = {
      name,
      type: compactSchemaType(schema),
      required: required.has(name)
    };
    const description = compactText(schema.title) ?? compactText(schema.description);
    const enumValues = compactEnum(schema.enum);
    if (description) field.description = description;
    if (enumValues) field.enum = enumValues;
    if (field.type === "array" && isRecord(schema.items)) field.itemType = compactSchemaType(schema.items as SchemaLike);
    fields.push(field);
  }

  return { type: "object", fields };
};

export const extractToolArguments = async (params: { input: unknown; tool: ToolDefinition; correlationId?: string; currentDate?: string }): Promise<ToolArgumentExtractionResult> => {
  const startedAt = Date.now();
  const schema = z.record(z.string(), z.unknown());
  const extractionSchema = buildExtractionSchema(params.tool.inputSchema);
  const extractionTool = { ...params.tool, inputSchema: buildPreGroundingExtractionSchema(params.tool.inputSchema) };
  const compactDescriptor = buildCompactExtractionDescriptor(extractionSchema);
  try {
    const execution = await executeStructuredOutput({
      baseMessages: [{ role: "system", content: [
        "You extract only arguments for the selected tool.",
        "Return only a JSON object matching the tool input schema.",
        "Do not return action, tool name, explanation, or reasoning.",
        "Use only listed fields. Copy human labels into Ref fields; never invent IDs. Do not invent date components.",
        ...(params.currentDate ? [`Temporal reference date: ${params.currentDate}. Day/month without year uses this year.`] : []),
        `Selected tool: ${params.tool.name}`,
        `Tool description: ${params.tool.description}`,
        `Tool input fields: ${JSON.stringify(compactDescriptor)}`,
        `User input: ${JSON.stringify(params.input)}`
      ].join("\n") }],
      schema,
      schemaDescription: compactDescriptor,
      generate: (messages) => llmService.chat({
        messages,
        temperature: 0,
        maxTokens: 180,
        responseSchema: llmService.supportsStructuredOutput ? extractionTool.inputSchema : undefined,
        diagnostic: { stage: messages.length > 1 ? "tool_argument_repair" : "tool_argument_extractor", correlationId: params.correlationId, toolName: params.tool.name }
      }),
      captureRawOutput: process.env.TOOL_DIAGNOSTICS_CAPTURE_RAW_OUTPUT === "true",
      validate: (argumentsValue) => validateToolCall({ name: params.tool.name, arguments: argumentsValue, requiresConfirmation: params.tool.requiresConfirmation }, [extractionTool]),
      repairInstructions: "Return ONLY an object matching the selected Tool input schema. Do not return RESPOND, CALL_TOOL, or reasoning. Do not invent required values."
    });
    return { status: "SUCCESS", arguments: execution.parsedOutput, attempts: execution.attemptCount, repairAttempt: execution.repairAttempt, durationMs: Date.now() - startedAt };
  } catch (error) {
    if (error instanceof AppError && error.code === "TOOL_ARGUMENTS_INVALID") {
      const details = error.details as Record<string, unknown> | undefined;
      const reason = typeof details?.reason === "string" ? details.reason : error.message;
      const missing = [...reason.matchAll(/(?:arguments\.)?([a-zA-Z0-9_]+) is required/g)].map((match) => match[1]).filter((value): value is string => Boolean(value));
      return { status: missing.length ? "MISSING_INFORMATION" : "INVALID", missing, attempts: 2, repairAttempt: true, durationMs: Date.now() - startedAt };
    }
    throw error;
  }
};
