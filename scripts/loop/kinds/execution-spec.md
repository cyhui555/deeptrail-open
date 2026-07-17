---
kind: execution-spec
dirName: execution-specs
indexedFields: [runId, digest, baseRevision, profile]
---

# execution-spec

一次 Shadow 的不可变执行合同；输入、Skill、Context、预算或基础 Revision 变化时必须生成新合同。

## Frontmatter

```yaml
title:         { type: string, required: true }
runId:         { type: string, required: true }
specVersion:   { type: number, required: true }
digest:        { type: string, required: true }
baseRevision:  { type: string, required: true }
contextDigest: { type: string, required: true }
skillDigest:   { type: string, required: true }
profile:       { type: string, required: true }
```

## Status machine

(none)
