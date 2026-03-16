"use client";

import { useState } from "react";
import type { AgentName } from "@/ai/agents/agent.types";

type ClassifyResponse = {
  success: boolean;
  data?: {
    agent: AgentName;
    inScope: boolean;
    confidence: number;
    reason: string;
  };
  error?: {
    message: string;
  };
};

const agents: AgentName[] = ["lead", "landing", "proposal", "support"];

export const ClassifierTester = () => {
  const [agent, setAgent] = useState<AgentName>("support");
  const [inputText, setInputText] = useState('{"ticketMessage":"No podemos entrar al dashboard"}');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClassifyResponse["data"] | null>(null);

  const handleClassify = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const parsedInput = JSON.parse(inputText) as unknown;
      const res = await fetch("/api/agents/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent, input: parsedInput })
      });

      const data = (await res.json()) as ClassifyResponse;
      if (!res.ok || !data.success || !data.data) {
        setError(data.error?.message ?? "Classification failed");
        return;
      }

      setResult(data.data);
    } catch {
      setError("Input debe ser JSON valido.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Scope Classifier</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="classifier-agent">
            Agent
          </label>
          <select
            id="classifier-agent"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            value={agent}
            onChange={(event) => setAgent(event.target.value as AgentName)}
          >
            {agents.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700" htmlFor="classifier-input">
          Input JSON
        </label>
        <textarea
          id="classifier-input"
          className="h-36 w-full rounded-md border border-slate-300 p-3 font-mono text-xs"
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
        />
      </div>

      <button
        type="button"
        onClick={handleClassify}
        disabled={loading}
        className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {loading ? "Clasificando..." : "Clasificar alcance"}
      </button>

      {error ? <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}

      {result ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <p>
            <strong>inScope:</strong> {String(result.inScope)}
          </p>
          <p>
            <strong>confidence:</strong> {result.confidence.toFixed(2)}
          </p>
          <p>
            <strong>reason:</strong> {result.reason}
          </p>
        </div>
      ) : null}
    </section>
  );
};
