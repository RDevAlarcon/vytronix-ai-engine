import os from "node:os";

export const INFERENCE_MEMORY_MINIMUM_MB = 2_000;
export const MEMORY_GATE_FAILURE = "RUNTIME_REGRESSION_MEMORY_GATE";

export type MemoryGateResult = {
  allowed: boolean;
  availableMb: number | null;
  reason?: string;
};

export function getAvailableMemoryMb(): number {
  const availableMb = Math.floor(os.freemem() / (1024 * 1024));
  if (!Number.isFinite(availableMb) || availableMb < 0) {
    throw new Error("Available memory measurement is invalid");
  }
  return availableMb;
}

export function assertInferenceMemoryGate(
  measure: () => number = getAvailableMemoryMb,
  log: (message: string) => void = console.log
): MemoryGateResult {
  try {
    const availableMb = measure();
    log(`MEMORY_GATE available=${availableMb}MB required=${INFERENCE_MEMORY_MINIMUM_MB}MB`);
    if (!Number.isFinite(availableMb) || availableMb < INFERENCE_MEMORY_MINIMUM_MB) {
      return { allowed: false, availableMb, reason: MEMORY_GATE_FAILURE };
    }
    return { allowed: true, availableMb };
  } catch (error) {
    log(`MEMORY_GATE available=INVALID required=${INFERENCE_MEMORY_MINIMUM_MB}MB`);
    return { allowed: false, availableMb: null, reason: `${MEMORY_GATE_FAILURE}: ${String(error)}` };
  }
}
