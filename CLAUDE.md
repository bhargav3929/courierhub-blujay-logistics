## My Agent Team

When I say "start the team", create an agent team with these 4 teammates
using Opus for all. Use delegate mode.

### Team Members

| #  | Name       | Role                  | Expertise                                                                 |
|----|------------|-----------------------|---------------------------------------------------------------------------|
| 1  | Frontend   | Senior Frontend Eng   | UI/UX design, React, Tailwind, shadcn/ui, responsive layouts, animation  |
| 2  | Backend    | Senior Backend Eng    | TypeScript, Next.js API Routes, Firebase/Firestore, Zod, external APIs   |
| 3  | Tester     | QA Engineer           | Test coverage, edge cases, error/empty states, integration testing        |
| 4  | Reviewer   | Staff Engineer (R/O)  | Security audits, anti-vibe-code compliance, performance, code quality     |

---

### Teammate 1 — "Frontend"
Senior frontend engineer with 15 years of design and UI/UX experience.
Owns ALL files in /frontend/. Must follow every anti-vibe-code rule
from the global CLAUDE.md. Every component responsive 375px to 1440px.
Research how top SaaS products implement similar components before building.

### Teammate 2 — "Backend"
Senior TypeScript/Node.js backend engineer. Owns ALL files in src/app/api/,
src/services/, src/lib/, and src/config/.
Stack: Next.js API Routes (App Router), Firebase/Firestore, firebase-admin.
Proper TypeScript types everywhere, structured error responses, Zod validation.
Follows existing service-layer pattern (singleton classes calling API routes).
Retry logic with exponential backoff for external courier API calls.

### Teammate 3 — "Tester"
QA engineer. Owns ALL test files. Tests after implementation is confirmed.
Covers happy paths, edge cases, error states, empty states.

### Teammate 4 — "Reviewer"
Staff engineer. READ-ONLY. Reviews all output for security, UI quality
(anti-vibe-code compliance), performance, and missing error handling.
Sends actionable feedback. Does not approve until issues are resolved.

---

### Rules
- File ownership is mandatory. No two teammates edit the same file.
- Require plan approval before implementation starts.

---

## Deployment & Branching Rules — READ BEFORE PUSHING

This project uses a strict two-branch workflow. **You MUST follow these rules every time you push, deploy, or merge — no exceptions, no shortcuts, regardless of how trivial the change feels.**

### Branches
- `main` = **production**. Every push to `main` deploys to the live production site on Vercel.
- `dev` = **staging**. Every push to `dev` deploys to a Vercel preview URL for manual testing.

### Who can push where
- `main` is **protected by a GitHub ruleset (id 16148768)**. Only repository admins can push or merge into it. Direct pushes, force-pushes, and deletions are blocked for non-admins. PR merges into `main` are also gated to admins.
- `dev` has no restrictions. Anyone with write access can push directly.

### Hard rules for any Claude session working in this repo
1. **Never push to `main` directly.** Default target for every push is `dev`. If a teammate or user says "deploy", "ship it", "push it", or "publish" without specifying a branch, that means push to `dev` — not `main`.
2. **Never merge a PR into `main` on your own.** Only the repo owner (`bhargav3929`) decides when `dev` gets promoted to production. If asked to "merge to main" or "promote to prod", confirm with the user first and then open a PR — do not click merge yourself unless you are operating as the owner with explicit approval for that specific merge.
3. **Never run `git push --force` on `main`.** It will be rejected by the ruleset anyway, but do not try.
4. **Always work on `dev` (or a feature branch off `dev`).** When starting a task, run `git checkout dev && git pull origin dev` first. Create feature branches from `dev`, not `main`.
5. **Commit messages and PR descriptions must say what changed and why.** Use Conventional Commits style (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`). Match the existing log style.
6. **Before pushing, run the project checks** that exist (typecheck, lint, build) and only push if they pass. If a check fails, fix it — do not push broken code to `dev` to "test in CI".
7. **After pushing to `dev`, report the Vercel preview URL** (or tell the user where to find it) so they can verify before promotion.
8. **The promotion path is always `dev → main` via Pull Request.** Never cherry-pick commits straight into `main`. Never rebase `main` onto something else.

### Standard flow you should follow
```
1. git checkout dev && git pull origin dev
2. (do the work, commit on dev or a feature branch off dev)
3. git push origin dev    ← this is the only deploy you initiate
4. Report the Vercel preview URL to the user
5. STOP. Wait for the user to verify and explicitly say "promote to production" / "merge to main"
6. Only then: open a PR dev → main and ask the user to merge it
```

### What "deploy" means in this project
- "Deploy" / "ship" / "push" with no other context = push to `dev`. That is a deploy — to the dev preview environment.
- "Deploy to production" / "promote to prod" / "release" = open a PR `dev → main` and wait for the owner's merge.
- If you are ever unsure which is meant, **ask before pushing**. The cost of asking is one sentence; the cost of an accidental production deploy is hours of cleanup.

### Why these rules exist
The owner is the only person who decides when production changes. Everything else flows through `dev` so it can be verified on a real preview URL before it touches live users. These rules apply to **every Claude session in this repo, indefinitely**, including sessions started months from now and including agent-team teammates.
