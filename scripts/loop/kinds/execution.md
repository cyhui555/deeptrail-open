---
kind: execution
dirName: executions
indexedFields: [status, profile, runId]
---

# execution

一次允许列表 Profile 的确定性执行。

## Frontmatter

```yaml
title:       { type: string, required: true }
status:      { type: enum, values: [pending, running, passed, failed] }
profile:     { type: string, required: true }
runId:       { type: string, required: true }
startedAt:   { type: date, required: false }
completedAt: { type: date, required: false }
```

## Status machine

```yaml
initial: pending
transitions:
  pending: [running, failed]
  running: [passed, failed]
```
