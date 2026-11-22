# What the UFO?!

A cinematic Cornish paranormal archive with anonymous public encounter submissions, a moderated publishing workflow and a private editorial Mission Control.

Phase 2 is a local-first application. It does **not** include deployment, member accounts, comments, notifications or automated email.

## Requirements

- Node.js 20.19+ (Node 22 LTS recommended)
- npm
- PostgreSQL 16+ or Docker

## First local setup

```bash
npm install
cp .env.example .env
npm run db:init
npm run db:migrate
npx prisma db seed
```

`db:init` uses Homebrew PostgreSQL 16 at `/opt/homebrew/opt/postgresql@16` and creates a repository-local, ignored database cluster on port `55432`. If you prefer Docker, run `docker compose up -d db` instead, then apply the migration and seed commands above.

Generate a strong local authentication secret before creating an administrator:

```bash
openssl rand -base64 32
```

Put that value in `BETTER_AUTH_SECRET` in `.env`. Replace the example `RATE_LIMIT_SECRET` as well. Then create the initial administrator from the command line only:

```bash
ADMIN_EMAIL="matt@example.com" \
ADMIN_NAME="Matt" \
ADMIN_PASSWORD="use-a-unique-password-of-at-least-12-characters" \
npm run admin:create
```

The public application intentionally has no administrator registration route.

## Running the application

```bash
npm run db:start
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Mission Control is at [http://localhost:3000/admin](http://localhost:3000/admin).

To stop the local database:

```bash
npm run db:stop
```

## Data and media

- Prisma migrations live in `prisma/migrations` and seed the four editorial categories.
- Public reports begin in `PENDING`; only `PUBLISHED` records appear in the archive, detail pages, homepage or Matt's Files.
- Contributor contact information is stored separately from public encounter content.
- Uploaded JPEG, PNG and WebP files are checked by file signature, constrained by size and pixel count, rotated, resized and re-encoded as WebP so embedded metadata is discarded.
- Original uploads are never retained. Processed images live in the ignored `.data/private-media` directory and are served only through an access-controlled route.
- Each submission receives a private recovery token for `/removal-request`. A verified removal unpublishes the encounter and erases contact details; anonymisation removes public attribution.

The storage layer is intentionally abstracted. A production deployment should replace local disk storage with private object storage while retaining the access checks.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit
```

The automated suite covers validation, safe image processing, pending submission persistence, private contact separation, public visibility, recovery-token verification, anonymisation, removal and audit history.

## Production checklist

Before any public launch:

- use a managed PostgreSQL database with encrypted backups and restricted credentials;
- use unique authentication and rate-limit secrets, HTTPS, secure cookies and the correct production origins;
- move private media to non-public object storage with encryption, retention rules and backups;
- replace the single-node database rate limiter if traffic or architecture requires a distributed limiter;
- add an operator email and transactional email provider for needs-information and moderation messages;
- configure monitoring, error reporting, database/media backup restoration tests and audit-log retention;
- complete privacy/terms legal review, define retention periods and document data-subject request handling;
- review administrator roles, password recovery and preferably add multi-factor authentication;
- run accessibility, security, load and cross-browser testing against a production-like environment;
- do not commit `.env`, `.data`, database files or contributor uploads.

## Useful database commands

```bash
npm run db:status
npm run db:generate
npm run db:migrate
npx prisma studio
```
