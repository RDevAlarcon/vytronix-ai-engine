"use client";

import { useState } from "react";

type RunFeedbackFormProps = {
  runId: string;
  initialFeedbackValue: string | null;
  initialFeedbackComment: string | null;
};

export const RunFeedbackForm = ({
  runId,
  initialFeedbackValue,
  initialFeedbackComment
}: RunFeedbackFormProps) => {
  const [feedbackValue, setFeedbackValue] = useState<string | null>(initialFeedbackValue);
  const [feedbackComment, setFeedbackComment] = useState(initialFeedbackComment ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const submitFeedback = async (value: "helpful" | "unhelpful") => {
    setState("saving");
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/runs/${runId}/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          feedbackValue: value,
          feedbackComment: feedbackComment.trim() || undefined
        })
      });

      const payload = (await response.json()) as { success?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error?.message ?? "No se pudo guardar feedback");
      }

      setFeedbackValue(value);
      setState("saved");
    } catch (error) {
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "No se pudo guardar feedback");
    }
  };

  return (
    <div className="card space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Feedback</h2>
        <p className="text-sm text-slate-600">Marca si este resultado fue util para el flujo real y deja una nota breve si hace falta.</p>
      </div>

      <textarea
        className="min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-brand-500"
        placeholder="Ej: repitio preguntas, entendio bien el objetivo, falto precision comercial"
        value={feedbackComment}
        onChange={(event) => setFeedbackComment(event.target.value)}
      />

      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={state === "saving"}
          onClick={() => submitFeedback("helpful")}
          type="button"
        >
          {feedbackValue === "helpful" ? "Marcado como util" : "Marcar util"}
        </button>
        <button
          className="rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={state === "saving"}
          onClick={() => submitFeedback("unhelpful")}
          type="button"
        >
          {feedbackValue === "unhelpful" ? "Marcado como no util" : "Marcar no util"}
        </button>
      </div>

      {state === "saved" ? <p className="text-sm text-emerald-700">Feedback guardado.</p> : null}
      {state === "error" && errorMessage ? <p className="text-sm text-rose-700">{errorMessage}</p> : null}
    </div>
  );
};
