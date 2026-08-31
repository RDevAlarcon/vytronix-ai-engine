import { LinuxMemoryReader, type MemoryReader } from "./linux-memory-reader";

export const DEFAULT_MIN_AVAILABLE_MEMORY_MB = 2_000;

export type MemoryGateReason = "ok" | "insufficient_memory" | "measurement_failed";

export type MemoryGateResult = {
  allowed: boolean;
  availableMb: number | null;
  thresholdMb: number;
  reason: MemoryGateReason;
};

export class ProductionMemoryGate {
  constructor(
    private readonly thresholdMb = DEFAULT_MIN_AVAILABLE_MEMORY_MB,
    private readonly reader: MemoryReader = new LinuxMemoryReader()
  ) {
    if (!Number.isSafeInteger(thresholdMb) || thresholdMb <= 0) {
      throw new Error("Memory gate threshold must be a positive integer");
    }
  }

  async check(): Promise<MemoryGateResult> {
    try {
      const availableMb = await this.reader.getAvailableMemoryMb();
      if (!Number.isFinite(availableMb) || availableMb < 0) {
        return { allowed: false, availableMb: null, thresholdMb: this.thresholdMb, reason: "measurement_failed" };
      }
      return {
        allowed: availableMb >= this.thresholdMb,
        availableMb,
        thresholdMb: this.thresholdMb,
        reason: availableMb >= this.thresholdMb ? "ok" : "insufficient_memory"
      };
    } catch {
      return { allowed: false, availableMb: null, thresholdMb: this.thresholdMb, reason: "measurement_failed" };
    }
  }
}
