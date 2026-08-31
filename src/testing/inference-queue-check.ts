import assert from "node:assert/strict";
import {
  InferenceQueue,
  InferenceQueueAbortedError,
  InferenceQueueFullError,
  InferenceQueueTimeoutError
} from "@/ai/runtime/inference-queue";

const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
};

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

const main = async () => {
  const queue = new InferenceQueue(5);
  const first = deferred<void>();
  const started: string[] = [];
  let active = 0;
  let maxActive = 0;
  const task = (name: string, work: Promise<void>) => queue.run(async () => {
    started.push(name);
    active += 1;
    maxActive = Math.max(maxActive, active);
    await work;
    active -= 1;
    return name;
  });

  const a = task("A", first.promise);
  await flush();
  assert.deepEqual(queue.getSnapshot(), { activeCount: 1, queueDepth: 0 });
  const b = task("B", Promise.resolve());
  const c = task("C", Promise.resolve());
  const d = task("D", Promise.resolve());
  const e = task("E", Promise.resolve());
  const f = task("F", Promise.resolve());
  assert.deepEqual(queue.getSnapshot(), { activeCount: 1, queueDepth: 5 });
  await assert.rejects(() => task("G", Promise.resolve()), InferenceQueueFullError);
  first.resolve();
  await Promise.all([a, b, c, d, e, f]);
  assert.deepEqual(started, ["A", "B", "C", "D", "E", "F"]);
  assert.equal(maxActive, 1);
  assert.deepEqual(queue.getSnapshot(), { activeCount: 0, queueDepth: 0 });

  const failureQueue = new InferenceQueue(5);
  const failure = failureQueue.run(() => { throw new Error("task failure"); });
  const afterFailure = failureQueue.run(() => "ok");
  await assert.rejects(failure, /task failure/);
  assert.equal(await afterFailure, "ok");
  const syncQueue = new InferenceQueue(5);
  const syncFailure = syncQueue.run(() => { throw new Error("sync failure"); });
  const syncNext = syncQueue.run(() => "next");
  await assert.rejects(syncFailure, /sync failure/);
  assert.equal(await syncNext, "next");

  const timeoutQueue = new InferenceQueue(5);
  const blocker = deferred<void>();
  const blockerRun = timeoutQueue.run(() => blocker.promise);
  const timedOut = timeoutQueue.run(() => "never", { queueTimeoutMs: 0 });
  await assert.rejects(timedOut, InferenceQueueTimeoutError);
  blocker.resolve();
  await blockerRun;
  assert.equal(timeoutQueue.getSnapshot().queueDepth, 0);

  const abortBefore = new AbortController();
  abortBefore.abort();
  const abortQueue = new InferenceQueue(5);
  let abortedCalled = false;
  await assert.rejects(() => abortQueue.run(() => { abortedCalled = true; }, { signal: abortBefore.signal }), InferenceQueueAbortedError);
  assert.equal(abortedCalled, false);

  const abortWaitingQueue = new InferenceQueue(5);
  const activeWork = deferred<void>();
  const activeRun = abortWaitingQueue.run(() => activeWork.promise);
  const abortWaiting = new AbortController();
  const waiting = abortWaitingQueue.run(() => "never", { signal: abortWaiting.signal });
  abortWaiting.abort();
  await assert.rejects(waiting, InferenceQueueAbortedError);
  assert.deepEqual(abortWaitingQueue.getSnapshot(), { activeCount: 1, queueDepth: 0 });
  activeWork.resolve();
  await activeRun;

  const middleQueue = new InferenceQueue(5);
  const middleActive = deferred<void>();
  const middleStarted: string[] = [];
  const middleA = middleQueue.run(async () => { middleStarted.push("A"); await middleActive.promise; });
  const middleAbort = new AbortController();
  const middleB = middleQueue.run(() => { middleStarted.push("B"); });
  const middleC = middleQueue.run(() => { middleStarted.push("C"); }, { signal: middleAbort.signal });
  const middleD = middleQueue.run(() => { middleStarted.push("D"); });
  middleAbort.abort();
  await assert.rejects(middleC, InferenceQueueAbortedError);
  middleActive.resolve();
  await Promise.all([middleA, middleB, middleD]);
  assert.deepEqual(middleStarted, ["A", "B", "D"]);

  const raceQueue = new InferenceQueue(5);
  const raceBlocker = deferred<void>();
  const raceActive = raceQueue.run(() => raceBlocker.promise);
  const raceAbort = new AbortController();
  const raceWaiting = raceQueue.run(() => { throw new Error("must not run"); }, { signal: raceAbort.signal, queueTimeoutMs: 0 });
  raceAbort.abort();
  await assert.rejects(raceWaiting, (error: unknown) => error instanceof InferenceQueueAbortedError || error instanceof InferenceQueueTimeoutError);
  raceBlocker.resolve();
  await raceActive;
  await flush();
  assert.deepEqual(raceQueue.getSnapshot(), { activeCount: 0, queueDepth: 0 });

  console.log("Inference queue checks passed.");
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
