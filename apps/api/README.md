# API

NestJS backend for the Access Control Audit Manager prototype.

## What it does

- authenticates users
- stores change requests and approvals
- executes approved directory changes
- writes audit log entries
- ingests observed SIEM events
- correlates observed events to requests

## Setup

Use the root project setup in `README.md`. The API reads configuration from the root `.env`.

If you want to run only the API:

```bash
npm install
npm run db:up
npm run db:migrate
npm run dev:api
```

The API starts on `http://localhost:3001`.

## Useful commands

```bash
npm run start:dev --workspace api
npm run build --workspace api
npm run test --workspace api
npm run migrate --workspace api
```

## Notes

- Database schema is created from `src/common/database/migrations/001_acma_schema.sql`.
- LDAP and SIEM integration depend on valid environment values in the root `.env`.
- The API can start without the web app, but most flows are easier to test with both apps running.
