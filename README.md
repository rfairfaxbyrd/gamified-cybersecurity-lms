# Gamified Cybersecurity Awareness Training LMS (MVP)

A small but complete, end-to-end MVP LMS for university cybersecurity awareness training:
- Users can sign in, browse modules, launch content, submit score/completion, earn points/badges, and track progress.
- Admins can view completion analytics and export attempts as CSV.

## Repo layout

- `lms/` → Next.js app (App Router) + TypeScript + Tailwind + Prisma + SQLite + NextAuth
- `content/` → Training content assets (H5P packages and/or exported HTML)

## Tech stack (MVP)

- Next.js (App Router) + TypeScript + Tailwind CSS
- SQLite via Prisma ORM
- NextAuth (Credentials provider) for local accounts (MVP)

## Prerequisites

- Node.js 20+
- npm 9+ (or compatible)

## Quick start (local dev preview)

From the repo root:

```bash
cd lms
cp .env.example .env
# Edit .env: set NEXTAUTH_SECRET at minimum
npm install
npm run prisma:generate
npm run db:setup
npm run dev
```

Open `http://localhost:3000`.

### Seeded demo accounts (dev only)

- Admin: `admin@setonhill.edu` / `Admin123!`
- User: `demo@setonhill.edu` / `Demo123!`

Change these before any real deployment (see `lms/.env.example`).

## Production preview (view before live)

This mimics the production runtime:

```bash
cd lms
npm run prisma:generate
npm run build
npm run start
```

## Important: Prisma version

This MVP currently targets Prisma `5.x` with SQLite. If you accidentally upgrade Prisma to `7.x`,
you may see errors like “datasource property `url` is no longer supported”. If that happens, pin back:

```bash
cd lms
npm install -D prisma@5.22.0
npm install @prisma/client@5.22.0
rm -rf node_modules package-lock.json
npm install
```

## Content: where modules live and how they are launched

### The `/content` folder (repo root)

This MVP serves training assets from the repo-root `content/` folder through a safe API route:
- URL format: `/api/content/<path...>`
- Disk location: `CONTENT_DIR` (env) or default `../content` (relative to `lms/`)

You can change `CONTENT_DIR` to point to a mounted volume (recommended for Docker/homelab).

### H5P modules (`.h5p`)

Place `.h5p` packages in `content/` (repo root). Example:

```text
content/spot-the-phish.h5p
```

The MVP module player supports embedding H5P using `h5p-standalone`, but **H5P packages must be extracted** first.
To keep the workflow simple, the app does this automatically on first launch:
- Extract destination: `content/_extracted/<moduleId>/...`

If embedding fails:
1) Re-run `npm install` in `lms/` (copies vendor assets into `lms/public/vendor/...`)
2) Ensure the server can write to `content/_extracted/` (permissions/volume mounts)

### Exported HTML modules (optional)

If you have an exported HTML version of a module, place it under `content/` and set the module record to:
- `launchType = HTML`
- `launchPath = "html/<your-module>/index.html"` (or a folder)

The player embeds HTML modules in an iframe pointed at `/api/content/<launchPath>`.

### SCORM packages (MVP auto score sync)

If you export SCORM (SCORM 1.2 or SCORM 2004) from a tool like Lumi:

1) Unzip the SCORM package into `content/` so the folder contains `imsmanifest.xml`.
2) Point the module record at the launch page:
   - Recommended: `launchType = SCORM`
   - `launchPath = "scorm/<your-module>/index.html"` (or the SCORM folder)

When the content calls the SCORM runtime API (`API` / `API_1484_11`) to report score/completion,
the LMS captures it and stores it as an Attempt automatically. If a package does not report a
score, you can still use the manual submission form on the module page as a fallback.

## Built-in mini-modules (hosted as Next.js pages)

Some mini-modules are shipped **inside** the LMS as normal Next.js routes (no files under `content/`).

### Cybersecurity Word Search

- URL (standalone): `/modules/word-search?moduleId=cyber-word-search`
- URL (iframe embed): `/modules/word-search?moduleId=cyber-word-search&seed=2&embed=1`

**postMessage payload (on completion)**

```js
{
  type: "MODULE_COMPLETE",
  moduleId,
  score,
  timeSeconds,
  hintsUsed,
  foundWords,
  totalWords
}
```

### Cybersecurity Wordle

- URL (standalone): `/modules/cyber-wordle?moduleId=cyber-wordle-001`
- URL (iframe embed): `/modules/cyber-wordle?moduleId=cyber-wordle-001&embed=1`
- Optional deterministic testing: `/modules/cyber-wordle?moduleId=cyber-wordle-001&seed=patch&embed=1`

**URL params**
- `moduleId` (required for reporting): included in completion payload and saved Attempts
- `seed` (optional): forces a specific solution word (examples: `0`, `2`, `patch`, `cyber`)
- `embed=1` (optional): auto-post completion to the parent window (LMS)

**postMessage payload (on completion)**

```js
{
  type: "MODULE_COMPLETE",
  moduleId,
  score,
  attemptsUsed,
  success,
  solutionWord,
  timeSeconds
}
```

### Cyber Crush

- URL (standalone): `/modules/cyber-crush?moduleId=cyber-crush-001`
- URL (iframe embed): `/modules/cyber-crush?moduleId=cyber-crush-001&embed=1`

What it is:
- A native match-3 cybersecurity mini-game with two levels:
- Level 1: Malware icons
- Level 2: Security icons

Cyber Crush asset folder:
- Place icons in `content/cyber-crush/icons/`
- Expected filenames:
- `worm.png`
- `virus.png`
- `trojan.png`
- `adware.png`
- `spyware.png`
- `ransomware.png`
- `firewall.png`
- `shield.png`
- `lock.png`
- `mfa.png`
- `patch.png`
- `antivirus.png`

How icon replacement works:
- If a file exists, the module loads it through `/api/content/cyber-crush/icons/<filename>`
- If a file is missing, Cyber Crush falls back to a labeled colored tile and keeps running

LMS completion payload:

```js
{
  type: "MODULE_COMPLETE",
  moduleId,
  score,
  success,
  levelsCompleted,
  movesUsed,
  timeSeconds
}
```

### Cyber Hill Climber

- URL (standalone): `/modules/cyber-hill-climber?moduleId=cyber-hill-climber-001`
- URL (iframe embed): `/modules/cyber-hill-climber?moduleId=cyber-hill-climber-001&embed=1`

What it is:
- A native decision-making mini-game where a climber reaches the summit by choosing the safer cybersecurity answer at each stage.

How gameplay works:
- One question = one mountain section
- Correct answer = climb higher
- Wrong answer = slip, fall, and end the run
- Reaching the summit requires answering every question safely

Where to edit questions:
- `lms/src/lib/cyberHillQuestions.ts`

How scoring works:
- Win = `100`
- Early loss = score based on how many questions you cleared before falling
- Scoring helper lives in `lms/src/lib/cyberHillGameLogic.ts`

LMS completion payload:

```js
{
  type: "MODULE_COMPLETE",
  moduleId,
  score,
  success,
  questionsAnswered,
  totalQuestions,
  timeSeconds
}
```

## Notes: MVP regression checks

This repo includes interactive modules that need a browser to fully validate.
In this environment, port binding is restricted, so the automated checks run were:
- `cd lms && npm run lint`
- `cd lms && npm run build`

After pulling changes locally, manually verify:
- Open the module catalog (`/modules`)
- Launch at least 2 existing H5P/SCORM modules from the catalog
- Complete the Word Search module
- Complete the Cybersecurity Wordle module
- Load and finish Cyber Crush
- Load and finish Cyber Hill Climber
- Temporarily rename or remove one Cyber Crush icon and confirm the fallback labeled tile appears
- Load the admin dashboard (`/admin`)
- Confirm the native modules save Attempts and emit `MODULE_COMPLETE`

## Admin analytics + CSV export

- Admin dashboard: `/admin`
- CSV export endpoint (admin-only): `/api/admin/attempts.csv`

## Docker (optional but recommended for homelab consistency)

Build the image (from repo root):

```bash
docker build -t cyber-lms ./lms
```

Run the container (example):

```bash
docker run --rm -p 3000:3000 \
  -e NEXTAUTH_SECRET="replace-me" \
  -e NEXTAUTH_URL="http://localhost:3000" \
  -e DATABASE_URL="file:./prisma/dev.db" \
  -e CONTENT_DIR="./content" \
  -v "$(pwd)/lms/prisma:/app/prisma" \
  -v "$(pwd)/content:/app/content" \
  cyber-lms
```

Then (first run) set up the DB schema + seed:

```bash
docker exec -it <container_id> sh -lc "npm run db:setup"
```

Notes:
- Mounting `./lms/prisma` persists the SQLite DB file across restarts.
- Mounting `./content` lets you update modules without rebuilding the image.

## Cloudflare Tunnel (cloudflared) for homelab exposure (no port forwarding)

High-level steps (do not hardcode secrets in Git):

1) Install `cloudflared` on your homelab host.
2) Authenticate:

```bash
cloudflared tunnel login
```

3) Create a tunnel:

```bash
cloudflared tunnel create cyber-lms
```

4) Create a `config.yml` on the homelab host (example):

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /path/to/<TUNNEL_ID>.json

ingress:
  - hostname: lms.yourdomain.edu
    service: http://localhost:3000
  - service: http_status:404
```

5) Run the tunnel:

```bash
cloudflared tunnel run cyber-lms
```

Important env vars when exposed publicly:
- Set `NEXTAUTH_URL` to your public hostname (e.g., `https://lms.yourdomain.edu`)
- Set a strong `NEXTAUTH_SECRET`
- Change seeded demo passwords (or disable seeding) before real use
