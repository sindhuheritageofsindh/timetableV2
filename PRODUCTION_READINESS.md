# Production Readiness Notes

This pass intentionally keeps the existing Timetable UI and product workflow unchanged. Changes are limited to correctness, persistence, desktop packaging, and runtime hardening.

## Correctness fixes included

- Teacher availability now treats only explicit `available: false` rows as unavailable; unspecified slots remain available as the UI describes.
- The scheduling engine no longer falls into an exponential full-school search when availability rules or preserved cells are present. It uses a regularized bipartite perfect-matching scheduler for hard constraints.
- Locked cells and non-selected classes are preserved exactly by slot during regeneration.
- Selected-class regeneration no longer turns preserved cells into user locks.
- Manual timetable edits and lock state are synced back to the latest Supabase timetable.
- Deleted classes, teachers, subjects, requirements, assignments, availability rows, and constraints are reconciled with Supabase instead of reappearing after reload.
- Editing an assignment no longer leaves an obsolete class/subject requirement behind.
- Entity deletion removes dependent in-memory records to prevent stale references.
- CSV assignment import avoids mutating React state arrays in place.
- Manual timetable edits reject inactive/missing entities, wrong teacher assignments, unavailable slots, conflicts, and workload overflow.
- Timetable reset also clears cloud timetables when Supabase is enabled, preventing deleted data from returning.
- Desktop `file://` routing and relative Vite assets are supported.

## Desktop hardening

- Renderer has `nodeIntegration: false`.
- `contextIsolation: true` and Chromium sandbox are enabled.
- Unexpected navigation and popups are denied; normal external HTTP/HTTPS/mail links open in the system browser/mail client.
- Permission requests are denied by default because the app does not require device permissions.
- A Content Security Policy is supplied in `index.html`.
- Single-instance behavior is enabled.
- NSIS `.exe` and native `.msi` x64 packaging are configured.

## Verification performed in this environment

- All TypeScript/TSX files pass an independent syntax/transpile sweep.
- Electron main-process JavaScript passes `node --check`.
- `electron-builder.yml` parses successfully.
- Scheduler regression tests pass for:
  - full 400-period school generation;
  - final timetable validation;
  - explicit teacher unavailability;
  - preservation of nine classes while regenerating one class;
  - exact preservation of a user-locked cell.

## Remaining deployment prerequisites

1. A Windows code-signing certificate is required for a trusted public publisher identity. It is intentionally not embedded in source control.
2. The current Supabase SQL is a no-auth, permissive single-school MVP policy. It is suitable only when the Supabase project itself is treated as private/trusted. A public multi-tenant deployment needs authentication and school-scoped RLS policies; adding that would change the product's access model and was intentionally not done in this no-UI-change pass.
3. Final installer compilation requires the npm/Electron package downloads and a Windows/WiX-compatible build environment. The included Windows script and GitHub Actions workflow provide that environment reproducibly.
