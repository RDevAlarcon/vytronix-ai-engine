"use client";

import { useMemo, useState } from "react";
import type { AgentExecutionMode, AgentName } from "@/ai/agents/agent.types";
import { agentExamples } from "@/ai/agents/agent.examples";
import { JsonViewer } from "@/components/json-viewer";

type ApiRunResponse = {
  success: boolean;
  data?: {
    runId: string;
    agent: AgentName;
    parsedOutput: unknown;
    rawOutput: string;
    metadata: {
      mode: AgentExecutionMode;
      model: string;
      provider: string;
      attemptCount: number;
      durationMs: number;
      usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
      };
    };
  };
  error?: {
    message: string;
    code?: string;
    details?: unknown;
  };
};

const agentList: AgentName[] = ["lead", "landing", "proposal", "support"];
const fastEnabledAgents = new Set<AgentName>(["lead"]);

export const AgentRunner = () => {
  const [agent, setAgent] = useState<AgentName>("lead");
  const [mode, setMode] = useState<AgentExecutionMode>("standard");
  const [inputText, setInputText] = useState(JSON.stringify(agentExamples.lead, null, 2));
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [response, setResponse] = useState<ApiRunResponse["data"] | null>(null);

  const currentExample = useMemo(() => JSON.stringify(agentExamples[agent], null, 2), [agent]);
  const outOfScopeInfo = useMemo(() => {
    if (!response || !response.parsedOutput || typeof response.parsedOutput !== "object") {
      return null;
    }

    const maybeRecord = response.parsedOutput as Record<string, unknown>;
    if (maybeRecord.is_in_scope === false) {
      return {
        reason: typeof maybeRecord.out_of_scope_reason === "string" ? maybeRecord.out_of_scope_reason : null,
        safeReply: typeof maybeRecord.safe_reply === "string" ? maybeRecord.safe_reply : null
      };
    }

    return null;
  }, [response]);

  const loadExample = () => {
    setInputText(currentExample);
    setErrorMessage(null);
  };

  const handleAgentChange = (nextAgent: AgentName) => {
    setAgent(nextAgent);
    if (!fastEnabledAgents.has(nextAgent)) {
      setMode("standard");
    }
    setInputText(JSON.stringify(agentExamples[nextAgent], null, 2));
    setResponse(null);
    setErrorMessage(null);
  };

  const handleRun = async () => {
    setLoading(true);
    setErrorMessage(null);
    setResponse(null);

    try {
      const parsedInput = JSON.parse(inputText) as unknown;
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent, input: parsedInput, mode })
      });

      const data = (await res.json()) as ApiRunResponse;
      if (!res.ok || !data.success || !data.data) {
        setErrorMessage(data.error?.message ?? "Agent run failed");
        return;
      }

      setResponse(data.data);
    } catch (error) {
      if (error instanceof SyntaxError) {
        setErrorMessage("El input debe ser JSON valido.");
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="agent">
            Agent
          </label>
          <select
            id="agent"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            value={agent}
            onChange={(event) => handleAgentChange(event.target.value as AgentName)}
          >
            {agentList.map((agentName) => (
              <option key={agentName} value={agentName}>
                {agentName}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="mode">
            Modo de respuesta
          </label>
          <select
            id="mode"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            value={mode}
            onChange={(event) => setMode(event.target.value as AgentExecutionMode)}
          >
            <option value="fast" disabled={!fastEnabledAgents.has(agent)}>
              Fast (mas rapido) {fastEnabledAgents.has(agent) ? "" : "- solo lead"}
            </option>
            <option value="standard">Standard (mas completo)</option>
          </select>
          {!fastEnabledAgents.has(agent) ? (
            <p className="text-xs text-slate-500">Para estabilidad, este agente se ejecuta en modo standard.</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-700" htmlFor="input-json">
              Input JSON
            </label>
            <button
              className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
              type="button"
              onClick={loadExample}
            >
              Cargar ejemplo
            </button>
          </div>
          <textarea
            id="input-json"
            className="h-80 w-full rounded-md border border-slate-300 p-3 font-mono text-xs"
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
          />
        </div>

        <button
          type="button"
          onClick={handleRun}
          disabled={loading}
          className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
        >
          {loading ? "Ejecutando..." : "Ejecutar agente"}
        </button>
        {errorMessage ? <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{errorMessage}</p> : null}
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Resultado</h2>
        {response ? (
          <>
            <div className="text-sm text-slate-600">
              <p>
                Run ID: <span className="font-mono">{response.runId}</span>
              </p>
              <p>
                Model: {response.metadata.model} ({response.metadata.provider}) | Modo: {response.metadata.mode}
              </p>
              <p>
                Duracion: {response.metadata.durationMs} ms | Intentos: {response.metadata.attemptCount} | Tokens:{" "}
                {response.metadata.usage?.totalTokens ?? "-"}
              </p>
            </div>
            {outOfScopeInfo ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-semibold">Out of scope detectado</p>
                <p>{outOfScopeInfo.safeReply ?? "Consulta fuera del alcance del agente."}</p>
                {outOfScopeInfo.reason ? <p className="mt-1 text-xs">{outOfScopeInfo.reason}</p> : null}
              </div>
            ) : null}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">Parsed Output</h3>
              <JsonViewer value={response.parsedOutput} />
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">Raw Output</h3>
              <pre className="max-h-56 overflow-auto rounded-md bg-slate-900 p-4 text-xs text-slate-100">
                {response.rawOutput}
              </pre>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-600">Ejecuta un agente para ver resultado estructurado.</p>
        )}
      </section>
    </div>
  );
};
