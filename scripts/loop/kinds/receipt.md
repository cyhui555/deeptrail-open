---
kind: receipt
dirName: receipts
indexedFields: [outcome, operation, runId]
---

# receipt

Gateway 操作结果的受限摘要。

## Frontmatter

```yaml
title:     { type: string, required: true }
outcome:   { type: enum, values: [passed, failed, reused] }
operation: { type: string, required: true }
runId:     { type: string, required: false }
sha256:    { type: string, required: true }
```

## Status machine

(none)
