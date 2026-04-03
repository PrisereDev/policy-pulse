# Models (`app.models`)

SQLAlchemy ORM models for the Prisere policy comparison backend. All models inherit from `Base` in `app.database` and map to PostgreSQL tables.

## Module layout

| File | Contents |
|------|----------|
| `user.py` | `User` |
| `analysis_job.py` | `JobStatus` (enum), `AnalysisJob` |
| `analysis_result.py` | `AnalysisResult` |
| `__init__.py` | Re-exports `User`, `AnalysisJob`, `JobStatus`, `AnalysisResult` for Alembic and imports |

Alembic loads these models via `app/models/__init__.py` in `alembic/env.py` so migrations see the full schema.

---

## Relationship overview

```mermaid
erDiagram
    users ||--o{ analysis_jobs : "has many"
    analysis_jobs ||--o| analysis_results : "one optional result"

    users {
        string id PK
        string email UK
        string name
        string company_name
        datetime created_at
        datetime updated_at
    }

    analysis_jobs {
        string id PK
        string user_id FK
        enum status
        int progress
        string status_message
        string baseline_s3_key
        string renewal_s3_key
        string baseline_filename
        string renewal_filename
        text error_message
        datetime created_at
        datetime updated_at
        datetime started_at
        datetime completed_at
        string metadata_company_name
        string metadata_policy_type
    }

    analysis_results {
        string job_id PK_FK
        int total_changes
        json change_categories
        json changes
        json premium_comparison
        json suggested_actions
        json educational_insights
        float confidence_score
        string analysis_version
        string model_version
        int processing_time_seconds
        datetime created_at
    }
```

### Cascade behavior

- **User → AnalysisJob**: `User.analysis_jobs` uses `cascade="all, delete-orphan"`. Deleting a `User` deletes their jobs.
- **AnalysisJob → AnalysisResult**: `AnalysisJob.result` uses `cascade="all, delete-orphan"` and `uselist=False` (one-to-one). Deleting a job deletes its result row.

Foreign keys use `ondelete="CASCADE"` at the database level for `analysis_jobs.user_id → users.id` and `analysis_results.job_id → analysis_jobs.id`.

---

## `JobStatus` (`analysis_job.py`)

String enum stored as a non-native SQLAlchemy enum (string column, length 20).

| Value | Meaning |
|-------|---------|
| `pending` | Job created; processing not started |
| `processing` | Background worker is running |
| `completed` | Finished successfully; an `AnalysisResult` should exist |
| `failed` | Error during processing; `error_message` set |

Used by `AnalysisJob.status` and in `AnalysisJob.to_dict()`, `_estimate_completion_time()`, and status transition helpers.

---

## `User` (`user.py`)

Table: `users`

### Columns

| Column | Type | Notes |
|--------|------|--------|
| `id` | `String(255)` | Primary key; intended to match the Clerk user id when auth is wired up |
| `email` | `String(255)` | Unique, indexed, required |
| `name` | `String(255)` | Optional |
| `company_name` | `String(255)` | Optional |
| `created_at` | `DateTime` | Default `utcnow` on insert |
| `updated_at` | `DateTime` | Updated on change |

### Relationships

- `analysis_jobs`: list of `AnalysisJob` rows for this user.

### Methods

| Method | Description |
|--------|-------------|
| `__repr__()` | Debug string with `id`, `email`, `name` |
| `to_dict()` | JSON-friendly dict: `id`, `email`, `name`, `company_name`, ISO `created_at` / `updated_at` |

### Where it is used

- Routers use a **mock user** (`get_mock_user` in `app/routers/analyses.py`) for development; real users are expected to be created/synced when Clerk is enabled.
- `scripts/create_test_user.py` inserts a test user for local DB work.

---

## `AnalysisJob` (`analysis_job.py`)

Table: `analysis_jobs`

Represents one policy comparison run (baseline + renewal PDFs identified by S3 keys).

### Columns

| Column | Type | Notes |
|--------|------|--------|
| `id` | `String(36)` | UUID string primary key |
| `user_id` | `String(255)` | FK → `users.id` |
| `status` | `JobStatus` | Indexed |
| `progress` | `Integer` | 0–100 |
| `status_message` | `String(500)` | Human-readable step (e.g. extraction, AI) |
| `baseline_s3_key` / `renewal_s3_key` | `String(500)` | S3 object keys |
| `baseline_filename` / `renewal_filename` | `String(255)` | Original upload names |
| `error_message` | `Text` | Set when `status == failed` |
| `created_at` / `updated_at` | `DateTime` | Job lifecycle timestamps |
| `started_at` | `DateTime` | Set when processing begins |
| `completed_at` | `DateTime` | Set when completed or failed |
| `metadata_company_name` | `String(255)` | Optional |
| `metadata_policy_type` | `String(100)` | Optional |

### Relationships

- `user`: parent `User`.
- `result`: optional `AnalysisResult` (one row per completed job).

### Methods

| Method | Description |
|--------|-------------|
| `__repr__()` | Debug string with `id`, `user_id`, `status` |
| `to_dict()` | API-shaped dict: `job_id`, `status`, timestamps, filenames, `estimated_completion_time`, `error_message` (only if failed), `progress`, `message` |
| `_estimate_completion_time()` | **Private.** Returns ISO completion time: completed/failed → `completed_at`; processing → extrapolates from `progress` and `started_at` (~120s total assumption); otherwise `None` |
| `update_progress(progress, message=None)` | Clamps `progress` to 0–100, optional `status_message`, refreshes `updated_at` |
| `mark_processing()` | Sets `PROCESSING`, `started_at`, `updated_at` |
| `mark_completed()` | Sets `COMPLETED`, `progress=100`, `completed_at`, `updated_at` |
| `mark_failed(error_message)` | Sets `FAILED`, stores error, `completed_at`, `updated_at` |

### Lifecycle (typical)

1. **Create** — Router creates row with `PENDING`, S3 keys, filenames, metadata (`app/routers/analyses.py`).
2. **Process** — `AnalysisProcessor.process_analysis_job` calls `mark_processing()`, then repeatedly `update_progress(...)`, then persists `AnalysisResult`, then `mark_completed()`. On exception, `mark_failed(...)`.
3. **Read** — Status and list endpoints query by `user_id` + `job_id`; result endpoint requires `COMPLETED` and loads `AnalysisResult`.

---

## `AnalysisResult` (`analysis_result.py`)

Table: `analysis_results`

Stores the structured output of a successful Claude comparison. **One row per job**; primary key is `job_id` (same as `analysis_jobs.id`).

### Columns

| Column | Type | Notes |
|--------|------|--------|
| `job_id` | `String(36)` | PK + FK → `analysis_jobs.id` |
| `total_changes` | `Integer` | Count of coverage changes |
| `change_categories` | `JSON` | Counts per category (e.g. `coverage_limit`, `deductible`) |
| `changes` | `JSON` | List of change objects (from Claude `coverage_changes`) |
| `premium_comparison` | `JSON` | Premium comparison blob |
| `suggested_actions` | `JSON` | Derived from Claude `broker_questions` in `from_claude_response` |
| `educational_insights` | `JSON` | List of insight objects (currently often empty) |
| `confidence_score` | `Float` | Average of per-change `confidence` when present |
| `analysis_version` | `String(50)` | Default `"1.0"` |
| `model_version` | `String(100)` | Claude model id used |
| `processing_time_seconds` | `Integer` | Wall-clock processing time |
| `created_at` | `DateTime` | When the result row was created |

### Relationships

- `job`: parent `AnalysisJob`.

### Methods

| Method | Description |
|--------|-------------|
| `__repr__()` | Debug string with `job_id`, `total_changes` |
| `to_dict()` | Normalizes each change (defaults for strings, `page_references` baseline/renewal lists) and returns a nested dict: `job_id`, `status` (`"completed"`), `summary`, `changes`, `premium_comparison`, `suggested_actions`, `educational_insights`, `metadata` (versions, timing, `completed_at`) — aligned with the Pydantic `AnalysisResultResponse` shape used by the API |
| `from_claude_response(job_id, claude_data, model_version, processing_time)` **(classmethod)** | Builds an `AnalysisResult` from parsed Claude JSON: reads `coverage_changes`, builds `change_categories` counts, computes average `confidence_score`, maps `broker_questions` to `suggested_actions` with categories/priority, sets `educational_insights` to `[]`, does not populate `analysis_version` (uses column default) |

### Claude payload expectations (`from_claude_response`)

- `coverage_changes`: list of change dicts (used for `changes`, counts, confidence).
- `premium_comparison`: passed through.
- `broker_questions`: list of strings → `suggested_actions`.

---

## How models interact in the application

1. **HTTP create job** — Inserts `AnalysisJob` with `user_id` from (mock) auth; no `AnalysisResult` yet.
2. **Background task** — `AnalysisProcessor` loads `AnalysisJob` by `id`, updates status/progress, then `AnalysisResult.from_claude_response(...)`, `db.add(analysis_result)`, commits, then `job.mark_completed()`.
3. **HTTP status** — Reads `AnalysisJob` only; builds Pydantic `AnalysisJobResponse` (not necessarily `to_dict()` on the model).
4. **HTTP result** — Ensures job is `COMPLETED`, loads `AnalysisResult` by `job_id`; response uses `result.to_dict()` (see `analyses` router).
5. **HTTP list** — Iterates jobs; uses `job.result.total_changes` when completed and relationship is loaded.

---

## Related files (outside this package)

| Area | Role |
|------|------|
| `app/database.py` | `Base`, `get_db`, `get_db_context`, `init_db()` |
| `app/routers/analyses.py` | CRUD-style access to jobs and results |
| `app/services/analysis_processor.py` | Job state machine + `AnalysisResult` creation |
| `app/schemas/analysis.py` | Pydantic request/response shapes (API contract) |
| `alembic/` | Migrations; keep in sync with these models |

---

## Imports

```python
from app.models import User, AnalysisJob, JobStatus, AnalysisResult
```

Or from individual modules:

```python
from app.models.user import User
from app.models.analysis_job import AnalysisJob, JobStatus
from app.models.analysis_result import AnalysisResult
```
