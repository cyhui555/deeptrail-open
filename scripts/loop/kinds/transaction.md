---
kind: transaction
dirName: transactions
indexedFields: [status, operation, externalId]
---

# transaction

Gateway 写操作与外部事务清单之间的可追踪映射。

## Frontmatter

```yaml
title:      { type: string, required: true }
status:     { type: enum, values: [prepared, active, committed, failed, recovery_required] }
operation:  { type: string, required: true }
externalId: { type: string, required: true }
runId:      { type: string, required: false }
```

## Status machine

```yaml
initial: prepared
transitions:
  prepared: [active, failed]
  active:   [committed, failed, recovery_required]
```
