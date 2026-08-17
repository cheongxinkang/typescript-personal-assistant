import { randomUUID } from "node:crypto";
import type {
  BatchProvider,
  BatchRequestItem,
  BatchResultItem,
  BatchStatusResult,
  BatchSubmission,
} from "./batchProvider.js";

interface ScriptedBatch {
  statuses: BatchStatusResult[];
  results: BatchResultItem[];
}

/**
 * Scripted batches, keyed by the order `submit()` is called — test code
 * supplies the sequence of statuses `checkStatus` returns (so a poller test
 * can observe "in_progress" a few times before "ended") and the final
 * results. Never touches the network — every batch workflow test (Stage 6)
 * and the poller's own tests (below) run against this, not the real API,
 * since real batch latency (minutes to hours) makes it useless as a test
 * dependency (per phase-2-implementation-plan.md's Stage 0 finding).
 */
export class FakeBatchProvider implements BatchProvider {
  readonly name = "fake-batch";
  readonly submittedBatches: BatchRequestItem[][] = [];
  private readonly scripts = new Map<string, ScriptedBatch>();
  private readonly statusCallIndex = new Map<string, number>();

  /** Registers the scripted behavior for the Nth batch this provider submits (0-indexed). */
  scriptNextBatch(statuses: BatchStatusResult[], results: BatchResultItem[]): string {
    const providerBatchId = `fake-batch-${randomUUID()}`;
    this.scripts.set(providerBatchId, { statuses, results });
    return providerBatchId;
  }

  async submit(items: readonly BatchRequestItem[]): Promise<BatchSubmission> {
    this.submittedBatches.push([...items]);
    const providerBatchId = [...this.scripts.keys()][this.submittedBatches.length - 1];
    if (!providerBatchId) {
      throw new Error("FakeBatchProvider: no scripted batch registered for this submit() call.");
    }
    return { providerBatchId };
  }

  async checkStatus(providerBatchId: string): Promise<BatchStatusResult> {
    const script = this.scripts.get(providerBatchId);
    if (!script) {
      throw new Error(`FakeBatchProvider: no script for batch "${providerBatchId}"`);
    }
    const index = this.statusCallIndex.get(providerBatchId) ?? 0;
    const status = script.statuses[Math.min(index, script.statuses.length - 1)];
    this.statusCallIndex.set(providerBatchId, index + 1);
    if (!status) {
      throw new Error(`FakeBatchProvider: no status scripted for batch "${providerBatchId}"`);
    }
    return status;
  }

  async fetchResults(providerBatchId: string): Promise<BatchResultItem[]> {
    const script = this.scripts.get(providerBatchId);
    if (!script) {
      throw new Error(`FakeBatchProvider: no script for batch "${providerBatchId}"`);
    }
    return script.results;
  }
}
