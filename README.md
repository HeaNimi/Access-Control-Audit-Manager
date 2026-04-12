# ACAM-TS

Access Control Audit Manager thesis prototype.

This repository contains:
- `apps/api` - NestJS API for authentication, request workflow, execution, audit logging, SIEM ingest, and event correlation
- `apps/web` - Nuxt UI for requests, audit, observed events, logs, and settings
- `packages/contracts` - shared TypeScript contracts

## Requirements

- Node.js 24+
- npm 11+
- Docker

## Quick start

1. Copy `.env.example` to `.env`.
2. Update the LDAP, local admin, and SIEM values in `.env` for your environment.
3. Install dependencies:

```bash
npm install
```

4. Start PostgreSQL:

```bash
npm run db:up
```

5. Run the database migration:

```bash
npm run db:migrate
```

6. Start the API and web app:

```bash
npm run dev
```

## Local URLs

- Web: `http://localhost:3000`
- API: `http://localhost:3001`

## Useful commands

```bash
npm run dev
npm run dev:api
npm run dev:web
npm run build
npm run test
npm run db:down
```

## Notes

- `.env.example` is sanitized and uses placeholder values under `example.local`.
- PostgreSQL runs from `infra/docker/docker-compose.yml` on `localhost:5432`.
- `SIEM_PULL_ENABLED=false` by default, so observed events are not polled until you enable and configure the SIEM settings.
- `DIRECTORY_EXECUTION_MODE=ldap` expects a real LDAP/Active Directory environment. Without valid LDAP settings, login, directory reads, and request execution will fail.
