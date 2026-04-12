# ACAM-TS

Thesis prototype for Active Directory change management and audit correlation.

## Stack

- `apps/web`: Nuxt 4 internal admin UI
- `apps/api`: NestJS workflow and integration API
- `packages/contracts`: shared TypeScript contracts

## What the MVP includes

- real AD login using Windows `sAMAccountName`
- config-based AD group mapping to application roles
- local_admin login for recovery when AD auth is unavailable
- create, list, inspect, approve, and reject AD change requests
- automatic execution after approval through an `ldapts`-backed directory executor
- internal append-only audit logging
- observed AD or SIEM event ingestion
- deterministic request-to-event correlation and a unified request timeline

## Local setup

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL with `npm run db:up`.
3. Run migrations with `npm run db:migrate` or let the API run them on startup.
4. Start the API and UI with `npm run dev`.

## Authentication

- Sign in with your Windows `sAMAccountName` and password.
- The application syncs the AD user into `system_user` on successful login.
- `requester` is implicit for every authenticated AD user.
- `approver`, `auditor`, and `administrator` are resolved from AD groups configured through:
  - `AUTH_ROLE_MAP_APPROVER_GROUP_DNS`
  - `AUTH_ROLE_MAP_AUDITOR_GROUP_DNS`
  - `AUTH_ROLE_MAP_ADMINISTRATOR_GROUP_DNS`
- A local_admin account is also available through:
  - `AUTH_LOCAL_ADMIN_USERNAME`
  - `AUTH_LOCAL_ADMIN_PASSWORD`

## Notes

- `DIRECTORY_EXECUTION_MODE=ldap` is the intended demo runtime and uses the configured AD service account for both lookup and execution.
- `AUTH_ENABLE_LDAP_LOGIN` and `AUTH_ENABLE_LOCAL_ADMIN_LOGIN` control the AD and local_admin login paths.
- If `LDAP_BIND_PASSWORD` is missing or invalid, AD lookup, execution, and the Settings health check will fail explicitly instead of silently falling back.
- Group membership changes are executed by modifying the AD group `member` attribute, not `memberOf`.
- `.env.example` is sanitized for publication and uses placeholder directory values under `example.local`.
- Replace the LDAP host, bind DN, OU, group DNs, and ingest key in `.env` before connecting the prototype to a real environment.
- `LDAP_UPN_SUFFIX` lets the backend derive `userPrincipalName` values like `new.user@example.local` when the form leaves UPN blank.
