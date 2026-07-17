# Security Key Rotation - 2026-07-11

> This document records rotation status only. Never add credential values, prefixes, suffixes, or hashes.

## Rotation status

| Service | Owner | Old credential revoked | Environments updated | Verified at | Notes |
| --- | --- | --- | --- | --- | --- |
| OpenAI-compatible AI provider | deployment owner | pending | pending | -- | Local Git history cleaned; provider console is blocked because Chrome/native-host access is unavailable |
| Gaode Web Service | deployment owner | pending-audit | pending | -- | No plaintext Gaode credential was found in any reachable local Git revision; provider console still requires an account audit |
| JWT signing secret | deployment owner | not-applicable | pending | -- | No local runtime value is configured; generate a new independent value for every deployed environment |

## Git history decision

- Status: `completed`
- Completed at: `2026-07-11`
- Scope: local `master`, `mvp-v1`, and `refs/stash` were rewritten with `git-filter-repo`; `refs/original`, reflogs, and unreachable objects were removed.
- Verification: all reachable revisions contain zero `sk-*` patterns and zero plaintext values in sensitive configuration properties.
- Remote note: this repository has no configured Git remote, so there was no remote history to force-push. If a remote is added later, push only the rewritten references and coordinate the non-fast-forward update with collaborators.

## Completion criteria

- New values are stored only in the deployment secret manager or local untracked environment.
- Each deployed environment is verified with AI, geocoding, login, and token refresh checks.
- Old third-party credentials are revoked after the new configuration is verified.
- The Git history decision is updated to `not-required` or `completed` by the repository owner.
