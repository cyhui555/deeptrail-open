---
kind: approval
dirName: approvals
indexedFields: [status, runId, gate]
---

# approval

显式人工或工程门禁批准；不得由 Shadow Run 伪造人工批准。

## Frontmatter

```yaml
title:      { type: string, required: true }
status:     { type: enum, values: [requested, approved, rejected, expired] }
runId:      { type: string, required: true }
gate:       { type: string, required: true }
approvedBy: { type: string, required: false }
```

## Status machine

```yaml
initial: requested
transitions:
  requested: [approved, rejected, expired]
```
