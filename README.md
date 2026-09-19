# Timetable

Automatic school timetable generator built with React + Vite + TypeScript.

## Critical scheduling behavior

- Timetables are generated school-wide, not class-by-class.
- A teacher can occupy at most one class in a day + period slot.
- A class can occupy at most one subject in a day + period slot.
- Every configured class/subject requirement is scheduled exactly.
- Teacher assignments are never guessed.
- Teacher availability and maximum workload are hard constraints.
- Locked entries are preserved during regeneration.
- A full validation pass runs before a timetable is accepted.
- Impossible configurations return diagnostics instead of fake timetable data.

## Environment

Set:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Without Supabase variables, the app uses browser localStorage for MVP development.

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Supabase

Run `supabase.sql` in a Supabase PostgreSQL project. Authentication is intentionally not used in this MVP.

### PDF export
The Master PDF uses a school-header and subject-by-class teacher matrix layout modeled on the provided school timetable reference. Class and Teacher exports retain the weekly day/period layout.

## Fixing "One has 33/40 periods configured"

The Smart School reference image gives teacher mappings but does not specify weekly subject frequencies. The included seed uses generator-ready frequencies that total exactly 40 periods for every active class.

If the database already contains the older seed, run `supabase_seed_smart_school.sql` again (it uses upserts), or use `supabase_repair_smart_school.sql` for a targeted repair of Class One before regenerating.

## Windows desktop (.exe + .msi)

The project includes a hardened Electron desktop wrapper without changing the React UI or workflow.

On a Windows x64 machine with Node.js installed, double-click `BUILD_WINDOWS.bat`, or run:

```powershell
npm run build:windows
```

The build is pinned to Electron `44.4.3` and electron-builder `26.16.1` by `scripts/build-windows.ps1`. It produces both formats under `release/`:

- `Timetable-1.0.0-x64.exe` — normal NSIS setup wizard.
- `Timetable-1.0.0-x64.msi` — Windows Installer package for managed/enterprise deployment.

A GitHub Actions workflow is also included at `.github/workflows/windows-build.yml`. Running **Build Windows Installers** uploads both files as a workflow artifact.

### Optional cloud environment in GitHub Actions

If the production build should connect to Supabase, configure the repository secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` and expose them to the build step. Without valid Supabase variables the app intentionally falls back to local storage.

### Production signing

The installer pipeline is ready for code signing, but no private signing certificate is bundled in this project. For public distribution, provide a trusted Windows code-signing certificate through your secure CI environment so Windows can verify the publisher.
