---
kind: outcome
dirName: outcomes
indexedFields: [status, runId, executionId, evidenceDigest]
---

# outcome

Verifier 根据真实 Evidence 与 Receipt 判定的执行结果；成功、失败和降级均保留。

## Frontmatter

```yaml
title:          { type: string, required: true }
status:         { type: enum, values: [passed, failed, degraded] }
runId:          { type: string, required: true }
executionId:    { type: string, required: true }
evidenceDigest: { type: string, required: true }
receiptDigest:  { type: string, required: true }
completedAt:    { type: date, required: true }
```

## Status machine

(none)
