---
kind: evidence
dirName: evidence
indexedFields: [evidenceType, runId, sha256]
---

# evidence

可复核但不包含密钥、原始用户数据或完整日志的证据摘要。

## Frontmatter

```yaml
title:        { type: string, required: true }
evidenceType: { type: enum, values: [command, file, runtime, doctor] }
runId:        { type: string, required: true }
sha256:       { type: string, required: true }
source:       { type: string, required: true }
exitCode:     { type: number, required: false }
```

## Status machine

(none)
