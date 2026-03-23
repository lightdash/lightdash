# App SDK Example: F1 Dashboard

A demo app built with `@lightdash/query-sdk` showing 2025 Formula 1 season data from a Lightdash project.

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` with your Lightdash instance URL, project UUID, and PAT.

## Running

```bash
npx vite --port 5180
```

Open http://localhost:5180. The Vite config proxies `/api` requests to the Lightdash instance to avoid CORS issues.
