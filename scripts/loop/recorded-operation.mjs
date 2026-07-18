import { canonicalSha256 } from "./canonical.mjs";
import { LoopGatewayError } from "./errors.mjs";
import { treeDigest } from "./tree.mjs";
import { beginTransaction, writeReceipt } from "./transactions.mjs";

export async function runRecordedOperation(config, definition) {
  const beforeWorkspaceDigest = await treeDigest(config.workspace);
  const input = {
    schemaVersion: 2,
    expectedRevision: definition.expectedRevision,
    targets: definition.targets ?? ["loop-workspace"],
    rollback: definition.rollback,
    beforeWorkspaceDigest,
    ...definition.input
  };
  const transaction = await beginTransaction(config, definition.operation, input);
  let applied;

  try {
    injectFault(definition, "prepared", transaction.id);
    await transaction.checkpoint("applying", { beforeWorkspaceDigest });
    injectFault(definition, "applying", transaction.id);

    applied = await definition.apply({ transaction });
    const sourceWorkspaceDigest = await treeDigest(config.workspace);
    await transaction.checkpoint("source_committed", {
      beforeWorkspaceDigest,
      sourceWorkspaceDigest,
      recovery: applied?.recovery ?? {}
    });
    injectFault(definition, "source_committed", transaction.id);

    await transaction.checkpoint("postchecking", {
      sourceWorkspaceDigest,
      recovery: applied?.recovery ?? {}
    });
    injectFault(definition, "postchecking", transaction.id);
    const verification = await definition.postcheck(applied, { transaction });
    const finalWorkspaceDigest = await treeDigest(config.workspace);
    const receiptPayload = {
      operation: definition.operation,
      outcome: applied?.operationOutcome ?? "passed",
      transactionId: transaction.id,
      inputDigest: canonicalSha256(input),
      beforeWorkspaceDigest,
      sourceWorkspaceDigest,
      finalWorkspaceDigest,
      result: applied?.receipt ?? {},
      verification,
      verificationDigest: canonicalSha256(verification)
    };
    const receipt = await writeReceipt(config, transaction.id, receiptPayload);
    const terminalStatus = applied?.transactionStatus ?? "closed";
    if (!new Set(["closed", "degraded"]).has(terminalStatus)) {
      throw new LoopGatewayError("INVALID_OPERATION_TERMINAL", `非法操作事务终态：${terminalStatus}`);
    }
    await transaction.checkpoint(terminalStatus, {
      receiptFile: receipt.file,
      receiptSha256: receipt.integritySha256,
      finalWorkspaceDigest,
      outcome: receiptPayload.outcome
    });
    return {
      transactionId: transaction.id,
      receiptFile: receipt.file,
      receiptSha256: receipt.integritySha256,
      transactionStatus: terminalStatus,
      applied,
      verification
    };
  } catch (error) {
    if (error instanceof InjectedHardFault) throw error;
    if (definition.controlledFailure?.(error) === true) {
      const receipt = await writeReceipt(config, `${transaction.id}-rejected`, {
        operation: definition.operation,
        outcome: "rejected",
        transactionId: transaction.id,
        inputDigest: canonicalSha256(input),
        error: error instanceof Error ? error.message : String(error)
      });
      await transaction.checkpoint("failed", {
        controlled: true,
        error: error instanceof Error ? error.message : String(error),
        receiptFile: receipt.file,
        receiptSha256: receipt.integritySha256
      }).catch(() => {});
      if (error && typeof error === "object") {
        error.details = { ...(error.details ?? {}), transactionId: transaction.id, receiptFile: receipt.file };
      }
      throw error;
    }
    await transaction.checkpoint("recovery_required", {
      failedAfter: transaction.status,
      recovery: applied?.recovery ?? error?.details?.recovery ?? {},
      error: error instanceof Error ? error.message : String(error)
    }).catch(() => {});
    if (error && typeof error === "object") {
      error.details = { ...(error.details ?? {}), transactionId: transaction.id };
    }
    throw error;
  }
}

export class InjectedHardFault extends LoopGatewayError {
  constructor(phase, transactionId) {
    super("INJECTED_HARD_FAULT", `测试故障注入：${phase}`, { phase, transactionId });
    this.phase = phase;
    this.transactionId = transactionId;
  }
}

function injectFault(definition, phase, transactionId) {
  if (definition.faultAfter === phase) {
    throw new InjectedHardFault(phase, transactionId);
  }
}
