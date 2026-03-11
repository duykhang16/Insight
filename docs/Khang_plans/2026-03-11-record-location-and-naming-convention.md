# Session Record: Record Location and Naming Convention

## Metadata

- Date: 2026-03-11
- Main topic: record location and naming convention
- Requested by: User
- Related files:
  - `docs/Khang_plans/README.md`
  - `docs/Khang_plans/SESSION_RECORD_TEMPLATE.md`

## User Request

The user requested that from now on:

- records should be stored in `docs/Khang_plans`
- each code modification should be documented in the active record file
- a new markdown should be created when continuing into the next topic or change
- file names should include both the date and the main topic/change

## Context Gathered

- `docs/Khang_plans` already exists in the repo
- the folder was empty before this update
- previous documentation templates were placed in other `docs/` subfolders

## Plan

1. Confirm the new folder exists.
2. Define the naming and recording rules in a single convention file.
3. Add a reusable template in the new canonical location.

## Exchange Log

- User: move future records to `docs/Khang_plans`
- User: include both date and topic in the filename
- User: keep recording modifications in the file, then create a new markdown for the next continuation
- Agent: created the convention and template in the requested location

## Proposed Changes

- Add a folder-level convention file to make the workflow explicit.
- Add a reusable session template in `docs/Khang_plans`.
- Treat this file as the first record under the new convention.

## Implemented Changes

- `docs/Khang_plans/README.md`
  - Added the canonical workflow, naming rules, and record lifecycle.
- `docs/Khang_plans/SESSION_RECORD_TEMPLATE.md`
  - Added a reusable template for future task records.
- `docs/Khang_plans/2026-03-11-record-location-and-naming-convention.md`
  - Logged this workflow change as the first entry in the new location.

## Verification

- Checks performed:
  - Confirmed `docs/Khang_plans` exists.
  - Added the convention and template files in that folder.
- Checks not performed:
  - No code or runtime testing was needed for this documentation-only change.

## Follow-up

- Next task:
  - Use `docs/Khang_plans/YYYY-MM-DD-main-topic.md` for all future work records.
- Risks:
  - Older records remain in other folders, so source-of-truth for historical notes is split until migrated.

