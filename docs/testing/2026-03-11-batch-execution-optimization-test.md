# Functional Test Draft: Batch Execution Optimization

## Metadata

- Date: 2026-03-11
- Feature: batch execution optimization
- Related session record: `docs/Khang_plans/2026-03-11-batch-execution-optimization.md`
- Tester: Pending

## Objective

Validate that batch operations complete more reliably and predictably under multiple target sites without causing excessive upstream failures, timeouts, or process instability.

## Preconditions

- Environment: Backend updated with bounded async concurrency for batch execution
- Required data: Multiple target sites across at least small, medium, and large batches
- Required accounts / roles: Role with access to batch operations and linked master account

## Test Cases

| ID | Scenario | Steps | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|
| TC-01 | Small batch success | Execute a batch action on 3-5 sites | All sites complete and result status is returned per site |  | Pending |
| TC-02 | Medium batch stability | Execute a batch action on 10-20 sites | No process crash, no global request failure, partial failures isolated per site |  | Pending |
| TC-03 | Upstream timeout handling | Force or simulate one slow/failing site | Batch continues and marks that site failed without aborting the whole job |  | Pending |
| TC-04 | Retry behavior | Force a transient upstream failure | Retriable sites recover within retry policy |  | Pending |
| TC-05 | Large batch control | Execute a larger batch near practical limit | Concurrency stays bounded and system remains responsive |  | Pending |
| TC-06 | User-facing audit log shape | Execute one batch action | User sees business-level action and selected site outcomes, not low-level Aruba API call trace |  | Pending |

## Notes

- Edge cases:
  - Duplicate site IDs
  - Invalid site IDs
  - Mixed permissions across sites
- Errors observed:
  - User reported `502` and runtime errors in current design
- Follow-up needed:
  - Finalize tests after implementation details are chosen
