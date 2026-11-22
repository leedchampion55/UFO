# What the UFO?!

A cinematic Cornish paranormal archive with moderated encounter publishing, free member accounts, encounter comments and The Mothership community forum.

Phase 3 is a local-first application. It is not deployed and does not configure a production email or object-storage provider.

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

`db:init` uses Homebrew PostgreSQL 16 at `/opt/homebrew/opt/postgresql@16` and creates an ignored, repository-local cluster on port `55432`. Alternatively, start the database with `docker compose up -d db`, then run the migration and seed commands. The seed creates the four encounter categories and five extensible Mothership categories.

Generate unique local secrets and place them in `.env`:

```bash
openssl rand -base64 32
```

Set both `BETTER_AUTH_SECRET` and `RATE_LIMIT_SECRET`. Never reuse the examples in production.

## Running the application

```bash
npm run db:start
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The public community is at `/mothership`, registration is at `/register`, and Mission Control is at `/admin`.

To stop the local database:

```bash
npm run db:stop
```

## Member registration and local email

Public registration accepts an email address, unique username and password of at least 12 characters. Public input cannot set a role; every public account is created as a `member`. Administrators remain CLI-only.

1. Register at `/register`.
2. Open the development mailbox at `/dev/mail` while `NODE_ENV` is not `production`.
3. Open the captured verification link.
4. Sign in at `/sign-in`.

Development verification and password-recovery messages are written with restrictive permissions beneath ignored `.data/dev-mail`. This capture route returns 404 in production. Production delivery is deliberately not bypassed: `lib/dev-mail.ts` fails closed in production until a transactional email adapter is configured. Configure a reputable provider, verified sender, delivery monitoring and the correct `BETTER_AUTH_URL` before launch.

Unverified accounts may sign in to inspect account status and resend verification, but server-side authorization prevents them from commenting or posting. Account settings at `/account` support display name, biography, verification resend and confirmed deletion. Public profiles never expose email addresses.

## Community workflows

- Anyone can read published discussions and encounter comments.
- Only signed-in, verified, non-suspended members can create discussions, comment or reply.
- Encounter comments support one reply level, editing/deletion by the author, reporting and pagination.
- The Mothership supports configurable categories, search, filtering, newest/recent activity sorting, pagination, pinned/locked topics and dedicated topic URLs.
- Reports accept a validated reason and optional details. Reports never remove content automatically.
- Deleted accounts leave readable content attributed to “Deleted member”, avoiding broken discussions.

Rate limits, same-origin checks, server-side validation, ownership checks and database-backed role/suspension checks protect all mutations. React renders member text as text rather than raw HTML.

## Mission Control and administrators

Create an administrator only from the command line:

```bash
ADMIN_EMAIL="matt@example.com" \
ADMIN_NAME="Matt" \
ADMIN_PASSWORD="use-a-unique-password-of-at-least-12-characters" \
npm run admin:create
```

The public application has no administrator registration route. Existing encounter moderation remains under `/admin`. Community moderation is under `/admin/community`, where an administrator can:

- inspect real member, discussion, report and suspension counts;
- pin, unpin, lock, unlock or remove discussions;
- remove replies and encounter comments;
- resolve or dismiss reports;
- find, suspend and reinstate members.

Suspension invalidates existing sessions and every posting mutation rechecks suspension in the database. Moderator identity, action, target, timestamp and optional reason are retained in `CommunityModeration`.

## Encounter privacy and media

- Registration is never required to submit an encounter.
- Public reports begin as `PENDING`; only `PUBLISHED` records appear publicly.
- Contributor contact information is stored separately and is never returned by public projections.
- JPEG, PNG and WebP uploads are signature-checked, size/pixel constrained, rotated, resized and re-encoded as WebP so metadata is discarded.
- Originals are not retained. Processed images live in ignored `.data/private-media` and are served by an access-controlled route.
- A private recovery token supports `/removal-request`; verified removal unpublishes the encounter, revokes public media access and erases contact details.

Production should replace local media storage with private object storage while preserving authorization and revocation checks.

## Database and migrations

Prisma migrations live in `prisma/migrations`. Phase 3 adds member profiles, discussion categories/topics/replies, encounter comments, community reports, suspension state and moderation history. Foreign keys preserve existing Phase 2 data; migrations do not reset the database. A database constraint requires every report to target exactly one supported content record.

Useful commands:

```bash
npm run db:status
npm run db:generate
npm run db:migrate
npx prisma studio
```

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

The database-backed suite covers registration, verification, recovery, role safety, suspension, comment ownership/replies/moderation, forum publishing/search/filtering/locking/reporting, and all important Phase 2 privacy and publishing regressions.

## Known limitations and production checklist

- Transactional email needs a production provider and credentials; local capture is development-only.
- Rate limiting is database-backed and suitable for the current single application deployment. Reassess for a distributed/high-volume architecture.
- Community posts are plain text with no images, private messages, realtime chat, voting or AI moderation by design.
- Member avatars and multi-factor authentication are not included in this phase.

Before launch, use managed PostgreSQL with encrypted backups, private object storage, HTTPS and secure cookies; configure correct origins, email delivery, monitoring, error reporting, audit retention and restoration tests; complete privacy/terms and accessibility/security review; review administrator MFA and recovery; and never commit `.env`, `.data`, database files or uploads.
