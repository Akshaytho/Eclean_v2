# ═══════════════════════════════════════════════════════════════
# eCLEAN v2 — MASTER PROMPT
# Paste this into Claude Code at the START of every session.
# ═══════════════════════════════════════════════════════════════

You are the engineer for eClean v2. eClean is an AI-powered civic work verification platform. Workers clean public areas, upload photos, Claude Vision AI verifies, payment releases automatically. Think Uber for civic sanitation work.

This repo has 2 codebases:
- `backend/` — Fastify API (COMPLETE, production-ready — only touch for specific fixes listed in Sprint 0)
- `mobile/` — React Native + Expo SDK 54 (BEING REBUILT from scratch)

DO NOT create any web frontend code. The admin web frontend is in a separate repo.

## REPO STRUCTURE

```
eclean-v2/
├── CLAUDE.md           ← Auto-loaded project instructions (tech stack, API, rules)
├── docker-compose.yml
├── backend/
├── mobile/             ← Being built
└── .claude/
    ├── MASTER_PROMPT.md  ← This file (paste into Claude at session start)
    ├── HANDOFF.md        ← What was done last session, what's next
    └── SPRINTS.md        ← Sprint plan with checkboxes
```

## YOUR SESSION PROTOCOL — DO THIS NOW:

```
STEP 1 — Read .claude/HANDOFF.md (what was done last session, what's next)
STEP 2 — Read .claude/SPRINTS.md (sprint plan with checkboxes — find current sprint)
STEP 3 — Read .claude/GAPS.md (master problems registry — pick ONE relevant gap)
```

After reading all three, tell me:
1. What sprint we are in
2. What has been completed so far
3. What needs to be done this session
4. Which ONE gap item from GAPS.md you will piggyback this session (relevant to current work)

Then WAIT for my confirmation before writing any code.

## GAPS.md RULES (read before every session):

- Pick EXACTLY ONE gap item relevant to current work domain
- Add it AFTER the main task is done — never disrupt the sprint
- Format when reporting: "🔧 Gap [{ID}]: {description} — will add after main task"
- Mark [x] + update COMPLETION LOG in GAPS.md when done
- If no gap is naturally relevant → skip entirely, don't force it

## ABSOLUTE RULES:
- Never `git add .` — stage specific files only
- Never hardcode secrets
- Money is always integer cents — never floats
- Tokens in expo-secure-store — NEVER AsyncStorage
- GPS via socket.emit('worker:gps') — NOT HTTP POST
- Background GPS via expo-task-manager — must work when phone locked
- Update .claude/HANDOFF.md before session ends
- Update .claude/SPRINTS.md checkboxes before session ends
- If changing backend files: run `cd backend && npm test` before committing
- After every sprint: run TypeScript check + tests and report results

## SESSION GOAL:
Continue from where .claude/HANDOFF.md says we left off.
Check .claude/SPRINTS.md for the detailed checklist of what to build.
Build the next unchecked items in order. Do not skip ahead to future sprints.


# ═══════════════════════════════════════════════════════════════
# END OF MASTER PROMPT
# ═══════════════════════════════════════════════════════════════
