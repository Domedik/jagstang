# AGENTS.md

Instructions for AI agents working in this repository.

## Project Overview

This is a medical records management web app ("Clineo") for clinics/doctors: patients, appointments calendar, clinical notes, forms/templates, and document/file management. UI is iOS-inspired with light/dark mode.

## Tech Stack

- **React 19** + **TypeScript** (strict-ish, see `tsconfig.app.json`)
- **Vite 7** — dev server and build tool
- **Chakra UI v2** (`@chakra-ui/react` ^2.10) — component/design system, with `@emotion/react` + `@emotion/styled`
- **React Router v7** — routing
- **React Big Calendar** — appointments calendar
- **TipTap v3** — rich text editor (notes, forms)
- **React Markdown** — markdown rendering
- **date-fns** — date handling
- **pdf-lib** / **react-pdf** — PDF generation/preview
- **ESLint 9 (flat config)** + **Prettier 3** — linting/formatting, enforced via `prettier/prettier` ESLint rule
- Package manager: **bun** (`bun.lock`). A stray `package-lock.json` also exists — ignore it; always use bun (`bun install`, `bun run …`, `bunx …`).

## Project Structure

```
src/
├── components/      # Reusable UI components (modals, drawers, cards, editors, etc.)
├── pages/           # Route-level views
├── pages/admin/     # Admin panel (ADMIN role only)
├── pages/library/   # Library/templates sub-section
├── contexts/        # React contexts (e.g. AuthContext)
├── services/        # API client (api.ts)
├── lib/             # Local data stores (e.g. clinicDataStore.ts)
├── config/          # App config: api.ts, features.ts, support.ts
├── constants/       # Shared constants
├── hooks/           # Custom hooks
├── theme/           # Chakra theme config
├── types/           # Shared TypeScript types
├── data/            # Mock data for development
└── assets/          # Static assets
```

## Commands

- `bun run dev` — start dev server
- `bun run build` — typecheck (`tsc -b`) + production build
- `bun run lint` — run ESLint
- `bun run preview` — preview production build

Always run `bun run lint` (and `tsc -b` via `bun run build` when relevant) after making changes, before considering a task done.

## Conventions

- Format with Prettier: single quotes, semicolons, 2-space indent, trailing commas (`es5`), 80-char width. Don't hand-format against these rules.
- Respect existing ESLint rules, notably `@typescript-eslint/no-unused-vars` (prefix intentionally-unused args with `_`).
- Match existing file/component naming: PascalCase for components and pages (`PatientDetail.tsx`), camelCase for utilities/hooks/services.
- New API endpoints belong in `src/config/api.ts` (`API_ENDPOINTS`), not hardcoded in components.
- Roles: `ADMIN` uses `pages/admin/` (duosonic). `NURSE` / `ASSISTANT` have reduced nav (team-member access via grants, not patient ownership).
- **Panel admin / compliance**: los pacientes se muestran **SIEMPRE por slug** con prefijo `#` (helper `displaySlug`), nunca por nombre/datos. El admin no tiene grants de paciente y no debe ver PII — por eso el compliance del admin identifica a cada paciente solo con su slug (fallback: id truncado). `normalizePatientSlug` (quita el `#`) es solo para URLs; no llamar a `/patients/` desde el panel admin para resolver nombres.
- Env vars are `VITE_`-prefixed and read via `import.meta.env`; never commit `.env` (already gitignored) or print/log secret values (`VITE_API_KEY`, etc).
- Prefer Chakra UI primitives and the existing theme (`src/theme`) over ad-hoc inline styles or new UI libraries.
- The codebase mixes English code/identifiers with Spanish domain language (UI copy, comments, docs). Follow the convention already used in the file you're editing rather than forcing one language.

## Git / Commit Policy — IMPORTANT

**Do not commit, push, tag, or otherwise mutate git state** unless the user
explicitly asks for that action. Do not auto-commit to "save progress".

- Read-only/staging git commands are fine when useful: `git status`, `git diff`,
  `git log`, `git add` (staging only, no commit unless asked).
- **If the user explicitly asks for a commit:** create it only under the user's
  local git identity (`user.name` / `user.email`, currently `Aldo V` /
  `arvazvi@proton.me`). Never pass `--author` / `--committer`, never set
  `GIT_AUTHOR_*` / `GIT_COMMITTER_*`, never amend authorship, and never commit
  as an agent, bot, or any other name.
- **Never create or move git tags** unless the user explicitly asks.
- If a task finishes without an explicit commit request, leave changes
  unstaged/staged and tell the developer what changed.
