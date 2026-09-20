# IntelliCanvas Backend Restructuring — Final Report

**Period:** 2026-09-19 / 2026-09-20
**Base:** `main` at `905cd93` (post PR #85, #86) → final `81648b4`
**Status:** Restructuring complete and merged. One closing PR (#96) outstanding.

---

## 1. Starting point: what was actually wrong

The assessment was measured, not guessed. The backend had a sound layered
foundation but a missing cross-cutting layer, which produced five concrete
defects:

| Problem | Evidence |
|---|---|
| No validation layer | the idiom `isinstance(x, bool) or not isinstance(x, int) or not low <= x <= high` was hand-written **47×** |
| Drifting contracts | brightness accepted `0-200` via the REST API but `-1000..1000` via the pipeline — same concept, two entry points, different rules |
| Scattered error codes | **63** bespoke codes with no central registry; the carefully-built `AppError` hierarchy had one call site |
| Fragile path filter | the security filter keeping storage paths out of responses was written **2 different ways across 12 endpoints** |
| No domain model | zero `dataclass`/`NamedTuple` in `backend/app/`; sessions, layers and results flowed as raw `dict[str, Any]` |

The cost was not cosmetic: a typo in a dict key surfaced only at runtime, and
a developer who forgot to filter one endpoint leaked an absolute filesystem
path to the client.

---

## 2. What was delivered

Four phases, each verified by a full quality gate before merge
(tests + `ruff check` + `compileall` + server boot + end-to-end API checks).

### Phase 1 — Cross-cutting layer (PR #87 → `b52e5e8`)
`+820 / -562` across 17 files (4 new modules + 13 modified).

- **`validation.py`** — `require_int` / `require_number` / `require_str` /
  `require_choice` / `require_odd_int` / `require_dict`. Each takes `code=` so
  field-specific contracts (`INVALID_BRIGHTNESS`) survive without a subclass
  per field. Replaces the 47 hand-written checks.
- **`error_codes.py`** — single `ErrorCodes` enum, **61 members**, kept as a
  1:1 registry rather than collapsing `*_FAILED` codes (tests assert on
  specific codes; collapsing would have been a behaviour change). AST scan
  confirmed zero raw error strings left in routes.
- **`views.py`** — `public_image()` / `public_view()` centralize the
  response filter.
- **`dependencies.py`** — one access point for storage/session collaborators,
  preserving the test-injection seam.

The brightness bounds conflict was resolved to **0-200 everywhere**: the
renderer divides by 100 (100 neutral, 0 black, 200 doubled), so the pipeline's
wide range admitted meaningless values.

### Phase 2 — Domain model (PRs #88, #89 → `232f324`)
`+253 / -96` across 15 files.

- **`domain/results.py`** — frozen `OperationResult` dataclass. The security
  win is structural: serialization is now an **allowlist** (`to_public_dict()`
  emits only declared public fields), so `path` does not exist in the output
  dict at all. Leaking it became impossible by type, not by discipline.
- 8 service construction sites converted (geometry, process, image_io,
  layer_compositor, pipeline_execution, background, smart_crop).
- 6 guard tests in `test_operation_result.py` pin the property.
- A **latent bug surfaced and was fixed**: `transform.py` returned the raw
  result to `jsonify` and worked only by accident because the old dict
  happened to carry no `path`. The conversion exposed it as
  `TypeError: WindowsPath is not JSON serializable`; all 5 transform returns
  now route through `public_image`.

`Layer`, `PipelineNode` and `ImageSession` were **deliberately deferred**: they
cross the persistence boundary (JSON round-trip through the database), and
`Layer` alone is read at 12+ sites with optional keys. Converting them needs a
mapping layer at the repository seam, so it is higher-risk than the rest.

### Phase 3 — Unified operation registry (PRs #90, #91 → `2b0ac4b`)
`+320 / -540` (net **-220 lines**) across 10 files.

One operation was previously defined in **four unrelated places** — the pure
function, a wrapper method, a branch in `PipelineExecutionService._apply`, and
a hand-kept two-entry registry — and they had already drifted apart.

- **`operations/registry.py`** — every operation lives once as an
  `OperationSpec` pairing URL slug, history label, validator and pixel
  transform. The pipeline and the REST routes both dispatch through
  `OPERATIONS`, so the contract cannot drift and adding an operation is
  additive (open/closed).
- `pipeline_execution_service._apply`: 14 branches → one registry lookup.
- `routes/process.py`: 15 hand-written endpoints → generated from the registry.
- `ProcessService`: 16 wrapper methods → one `run_op`.
- Deleted `operation_service.py` entirely — `NodeService` was constructed on
  every startup but none of its methods was ever called (verified by grep).
- A **real bug was caught**: `morphology` reported `erode` because a sub-operation
  parameter clobbered the response key. The unified path exposed it; existing
  tests detected it.

### Phase 4 — Architecture boundary tests (PRs #92, #93 → `f2d02d4`)
`+214` across 2 files.

`tests/test_architecture.py` makes the layering self-enforcing:

- No HTTP coupling in `services`/`domain`/`operations`
  (`secure_filename` is the one allowlisted pure helper).
- No service → routes imports; no route → repository imports.
- No import cycles in the service graph.
- **Every registered operation must have a route** — the open/closed guarantee
  in test form.

#### The bug the tests exposed
`backend/app/services/__init__.py` **never existed** — every sibling package had
one. `services` therefore ran as an implicit namespace package, which
`pkgutil.walk_packages` does not enumerate. The first draft of these tests
passed while examining **zero service modules** — a security check that proved
nothing. Fixed two ways: the missing file was added, and discovery now walks
the filesystem with `rglob("*.py")` plus a `test_layers_are_discoverable` guard
that fails loudly if a layer becomes invisible.

The checks were proven to have teeth by **mutation testing**: injecting
`from flask import request` and a two-module import cycle both failed the
intended tests and were reverted.

### Follow-on cleanup (PRs #94, #95 → `81648b4`, #96 open)
- **23 merged remote branches deleted** (24 → main + one unmerged feature);
  193 stale `.pyc` files and 7 `__pycache__` directories removed.
- **`ruff format` baseline** applied: 60 files reformatted, `+2325 / -642`,
  whitespace only. `.git-blame-ignore-revs` added so the pass does not pollute
  `git blame`.
- **5 verified-dead symbols removed** (-59 lines): `require_list`, the
  orphaned `ResourceGuard` class, `explain_suggestion`, `image_bytes`,
  `low_target`.

---

## 3. Final verification

| Check | Result |
|---|---|
| Tests | **259 passed** |
| `ruff check` | All checks passed |
| `ruff format --check` | 82 files already formatted |
| `compileall` | clean |
| Server boot + e2e | health 200; registry operations verified with no `path` leak |
| Architecture tests | 6/6 pass, mutation-validated |
| Working tree | clean |

---

## 4. Outcome: what became structurally impossible

The restructuring's measure is not lines removed but classes of defect
eliminated at the type level rather than by convention:

1. **Leaking a storage path to a client** — was a matter of forgetting a
   filter at one of 12 endpoints; now `path` does not exist in the serialized
   output at all.
2. **Two entry points disagreeing on one operation's rules** — was inevitable
   when the operation was defined four times; now both dispatch through one
   registry.
3. **Adding an operation requiring edits across four files** — now a single
   additive `OperationSpec`.
4. **A boundary violation shipping silently** — the architecture test fails
   the build, and it verifies that it is actually examining the code.

Two verification lessons recur and are worth keeping. First, a regex sweep for
`error_response("` reported "0 residual string literals" but missed **20** —
the calls wrap across lines; an AST scan found them. Second, the arch test
using `pkgutil` reported "services have zero Flask imports" and was vacuously
true, because the missing `__init__.py` meant no service was ever examined.
**A test that can find nothing proves nothing** — always confirm the fixture
enumerates the target before trusting its pass.

---

## 5. Open items requiring a decision

These are not defects in the restructuring; they are choices left to the owner.

1. **PR #96** — the dead-code removal reaching `main`. Merge to close the work.
2. **`feature/audit-remediation`** — adds `.github/workflows/ci.yml`, a CI
   quality gate that automates the manual gate run after every phase.
   Recommended: review and merge.
3. **`ResourceExceededError`** is now caught in `routes/suggestions.py` but
   never raised, since its only raiser was the removed `ResourceGuard`. Either
   wire a time-budget guard into the operation runner, or drop the handler —
   a behaviour change, so it was left untouched.
4. **Deferred dataclasses** — `Layer`/`PipelineNode`/`ImageSession` still flow
   as dicts (35 `.get()` call sites). An enhancement, not a debt.
5. **`feature/project-analysis-slices`** exists only locally with no remote
   backup; deleting it would lose it permanently.
