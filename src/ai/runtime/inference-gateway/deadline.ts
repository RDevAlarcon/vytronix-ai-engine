export type GatewayAbortReason = "client_aborted" | "total_timeout";

export type GatewayDeadline = {
  signal: AbortSignal;
  reason: () => GatewayAbortReason | null;
  remainingMs: () => number;
  dispose: () => void;
};

export function createGatewayDeadline(input: {
  clientSignal: AbortSignal;
  timeoutMs: number;
  now?: () => number;
}): GatewayDeadline {
  const now = input.now ?? Date.now;
  const deadlineAt = now() + input.timeoutMs;
  const controller = new AbortController();
  let reason: GatewayAbortReason | null = null;

  const abort = (value: GatewayAbortReason) => {
    if (controller.signal.aborted) return;
    reason = value;
    controller.abort(new DOMException(value, value === "total_timeout" ? "TimeoutError" : "AbortError"));
  };

  const clientAbort = () => abort("client_aborted");
  input.clientSignal.addEventListener("abort", clientAbort, { once: true });
  if (input.clientSignal.aborted) abort("client_aborted");

  const timer = setTimeout(() => abort("total_timeout"), input.timeoutMs);

  return {
    signal: controller.signal,
    reason: () => reason,
    remainingMs: () => Math.max(0, deadlineAt - now()),
    dispose: () => {
      clearTimeout(timer);
      input.clientSignal.removeEventListener("abort", clientAbort);
    }
  };
}
