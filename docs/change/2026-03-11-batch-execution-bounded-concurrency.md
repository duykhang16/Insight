# Code Change: Batch Execution with Bounded Concurrency

## Metadata

- Date: 2026-03-11
- Topic: batch execution bounded concurrency
- Related task record: `docs/Khang_plans/2026-03-11-batch-execution-optimization.md`
- Related test record: `docs/testing/2026-03-11-batch-execution-optimization-test.md`

## What Changed

- File: `backend/app/features/cloner/service.py`
- Change:
  - Added a shared bounded-concurrency batch runner.
  - Added retry handling for transient failures.
  - Added per-item timeout protection.
  - Refactored:
    - `batch_account_access`
    - `batch_site_delete`
    - `batch_site_provision`
  - Kept the public result structure list-based so the routes can continue returning the same shape.

## Logic Behind It

The previous design processed each site sequentially inside a long-running request. That made the whole batch sensitive to slow sites, upstream transient failures, and gateway timeout pressure.

The new design keeps the request model unchanged for now, but executes site work with bounded async concurrency. This fits the existing FastAPI and `httpx.AsyncClient` stack better than threads because the workload is network I/O, not CPU-bound computation.

The execution model now:

- limits concurrent site work with a small cap
- isolates per-site failures
- retries only transient failures
- returns one result per site or provisioned clone item

## Improvement

- Reliability:
  - One failed site no longer blocks all other sites from starting.
  - Timeouts and transient failures are isolated and retried in a controlled way.
- Performance:
  - Multiple sites can be processed in parallel without flooding Aruba upstream.
- Maintainability:
  - Shared execution logic reduces duplicated loop-and-sleep patterns across batch functions.

## Warning / Potential Fallback

- Risk:
  - If the concurrency limit is set too high, Aruba upstream may still rate-limit or destabilize.
- Limitation:
  - This is still request-bound execution, not a persistent background job queue.
- Fallback:
  - If batches grow larger or still hit gateway limits, move the same execution model behind a stored job and background worker.

## How To Use

- Endpoint or feature:
  - Existing batch endpoints under `/api/v1/cloner/*` continue to be used the same way.
- Inputs:
  - No request contract changes were introduced in this step.
- Expected output:
  - Results remain per-site or per-provisioned-item with success/error details.
- Operational notes:
  - Concurrency, timeout, and retry behavior are handled inside `cloner/service.py`.
  - User-facing logging still records business-level action results, not raw Aruba API trace logs.

