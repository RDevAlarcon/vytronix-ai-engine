export const MAX_ACTIVE_INFERENCES = 1;
export const MAX_QUEUE_SIZE = 5;

export class InferenceQueueError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "InferenceQueueError";
  }
}

export class InferenceQueueFullError extends InferenceQueueError {
  constructor() {
    super("Inference queue is full", "INFERENCE_QUEUE_FULL");
    this.name = "InferenceQueueFullError";
  }
}

export class InferenceQueueTimeoutError extends InferenceQueueError {
  constructor() {
    super("Inference queue wait timed out", "INFERENCE_QUEUE_TIMEOUT");
    this.name = "InferenceQueueTimeoutError";
  }
}

export class InferenceQueueAbortedError extends InferenceQueueError {
  constructor() {
    super("Inference request was aborted while waiting", "INFERENCE_QUEUE_ABORTED");
    this.name = "InferenceQueueAbortedError";
  }
}

export type InferenceQueueSnapshot = {
  activeCount: number;
  queueDepth: number;
};

export type InferenceTask<T> = (signal: AbortSignal) => T | PromiseLike<T>;

export type InferenceQueueRunOptions = {
  signal?: AbortSignal;
  queueTimeoutMs?: number;
};

type QueueEntry<T> = {
  task: InferenceTask<T>;
  signal: AbortSignal;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
  abortListener?: () => void;
  settled: boolean;
};

export class InferenceQueue {
  private readonly pending: QueueEntry<unknown>[] = [];
  private active = 0;

  constructor(
    private readonly maxQueueSize = MAX_QUEUE_SIZE,
    private readonly defaultQueueTimeoutMs?: number
  ) {}

  getSnapshot(): InferenceQueueSnapshot {
    return { activeCount: this.active, queueDepth: this.pending.length };
  }

  run<T>(task: InferenceTask<T>, options: InferenceQueueRunOptions = {}): Promise<T> {
    if (options.signal?.aborted) {
      return Promise.reject(new InferenceQueueAbortedError());
    }

    if (this.active === MAX_ACTIVE_INFERENCES) {
      if (this.pending.length >= this.maxQueueSize) {
        return Promise.reject(new InferenceQueueFullError());
      }
    }

    const signal = options.signal ?? new AbortController().signal;
    return new Promise<T>((resolve, reject) => {
      const entry: QueueEntry<T> = { task, signal, resolve, reject, settled: false };
      this.pending.push(entry as QueueEntry<unknown>);
      if (this.active === 0) this.pump();
      else {
        this.armQueueTimeout(entry, options.queueTimeoutMs ?? this.defaultQueueTimeoutMs);
        entry.abortListener = () => {
          const index = this.pending.indexOf(entry as QueueEntry<unknown>);
          if (index < 0) return;
          this.pending.splice(index, 1);
          this.settleRejected(entry, new InferenceQueueAbortedError());
        };
        entry.signal.addEventListener("abort", entry.abortListener, { once: true });
      }
    });
  }

  private armQueueTimeout<T>(entry: QueueEntry<T>, timeoutMs: number | undefined): void {
    if (timeoutMs === undefined) return;
    entry.timer = setTimeout(() => {
      if (entry.settled) return;
      const index = this.pending.indexOf(entry as QueueEntry<unknown>);
      if (index < 0) return;
      this.pending.splice(index, 1);
      this.settleRejected(entry, new InferenceQueueTimeoutError());
    }, Math.max(0, timeoutMs));
  }

  private pump(): void {
    if (this.active >= MAX_ACTIVE_INFERENCES) return;
    const entry = this.pending.shift();
    if (!entry || entry.settled) {
      if (entry) this.pump();
      return;
    }

    if (entry.timer) clearTimeout(entry.timer);
    if (entry.abortListener) entry.signal.removeEventListener("abort", entry.abortListener);
    if (entry.signal.aborted) {
      this.settleRejected(entry, new InferenceQueueAbortedError());
      this.pump();
      return;
    }

    this.active = 1;
    Promise.resolve()
      .then(() => entry.task(entry.signal))
      .then(entry.resolve, entry.reject)
      .finally(() => {
        this.active = 0;
        this.pump();
      });
  }

  private settleRejected<T>(entry: QueueEntry<T>, error: InferenceQueueError): void {
    if (entry.settled) return;
    entry.settled = true;
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.abortListener) entry.signal.removeEventListener("abort", entry.abortListener);
    entry.reject(error);
  }
}
