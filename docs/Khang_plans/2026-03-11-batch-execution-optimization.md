# Session Record: Batch Execution Optimization

## Metadata

- Date: 2026-03-11
- Main topic: batch execution optimization
- Requested by: User
- Related files:
  - `backend/app/features/cloner/routes.py`
  - `backend/app/features/cloner/service.py`

## User Request

The user reported that current batch execution flows such as batch delete and batch cloning are not optimized because they iterate site-by-site in a loop and execute one API call per site synchronously. The user asked to discuss the handling approach first before making code changes.

## Context Gathered

- Current batch endpoints in `cloner/routes.py` call service functions that process site IDs in loops.
- Several service functions also include sleeps and sequential HTTP execution.
- The user has observed failure modes such as `502` and runtime errors during batch execution.
- Current logging has two layers:
  - user-facing audit logs written to `audit_logs`
  - low-level capture logs in `raw_logs`, used by the hidden capture subsystem
- The current user-facing audit logs mostly record internal Insight actions, but some batch service functions also write one audit entry per target site.

## Plan

1. Explain the current problem shape at a high level.
2. Propose safer batch execution patterns and compare tradeoffs.
3. Agree on a target design before implementation.

## Exchange Log

- User: batch execution via per-site loop is not optimal and can trigger `502` and runtime errors.
- User: discuss how to handle it first before coding.
- User: user-facing logs should show that the user changed the selected sites, not low-level API calls to Instant On.
- User: check whether the current logging is handling the logging of API calls to Instant On.

## Proposed Changes

- Keep user-facing audit logs at the business-action level rather than the upstream Aruba API-call level.
- Review and likely refactor current batch logging so it records a job summary plus site results, instead of exposing transport-level call details to end users.
- Treat low-level Aruba call logging as internal diagnostics only, not as default user-visible audit history.
- Refactor the current sequential batch execution to use bounded async concurrency for the main batch operations in the cloner service.

## Implemented Changes

- `docs/Khang_plans/2026-03-11-batch-execution-optimization.md`
  - Created the work record for this topic.
- `backend/app/features/cloner/service.py`
  - Added a shared bounded batch executor with concurrency limit, retry handling, and per-item timeout protection.
  - Refactored `batch_account_access`, `batch_site_delete`, and `batch_site_provision` to use the shared executor.
- `docs/change/CODE_CHANGE_TEMPLATE.md`
  - Added a reusable code-change record template.
- `docs/change/2026-03-11-batch-execution-bounded-concurrency.md`
  - Added the code-change record for this implementation.

## Verification

- Checks performed:
  - Reviewed `GlobalLoggingMiddleware`, admin log read endpoints, super-admin log read endpoints, and manual `insert_audit_log` calls in batch service functions.
  - Backend syntax verification pending after code change.
- Checks not performed:
  - No live Aruba integration test executed in this step.

## Follow-up

- Next task:
  - Decide on the batch execution architecture.
- Risks:
  - Over-aggressive concurrency could worsen Aruba upstream failures if not rate-limited.
