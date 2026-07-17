---
kind: run
dirName: runs
indexedFields: [status, profile, gitCommit, inputHash]
---

# run

旅迹工程闭环的一次稳定输入实例。

## Frontmatter

```yaml
title:      { type: string, required: true }
status:     { type: enum, values: [planned, running, verified, failed, recovery_required] }
profile:    { type: string, required: true }
gitCommit:  { type: string, required: true }
inputHash:  { type: string, required: true }
workItem:   { type: string, required: true }
```

## Status machine

```yaml
initial: planned
transitions:
  planned:  [running, failed]
  running:  [verified, failed, recovery_required]
```
