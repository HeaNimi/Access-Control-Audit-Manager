# Web

Nuxt frontend for the Access Control Audit Manager prototype.

## What it does

- lets users create and review requests
- shows approvals, execution results, and timelines
- shows audit history and observed events
- exposes runtime settings and log views for administration

## Setup

Use the root project setup in `README.md`. The web app uses the root `.env` for public runtime values.

If you want to run only the web app:

```bash
npm install
npm run dev:web
```

The UI starts on `http://localhost:3000` and expects the API at `http://localhost:3001` unless you change `NUXT_PUBLIC_API_BASE_URL`.

## Useful commands

```bash
npm run dev --workspace web
npm run build --workspace web
npm run preview --workspace web
```

## Notes

- The UI depends on the API for all real data.
- Default form hints such as UPN suffix and mail domain come from the root `.env`.
- For full local development, start both apps with `npm run dev` from the repository root.
