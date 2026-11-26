# What the UFO?!

A cinematic Cornish paranormal archive with moderated encounter publishing, free member accounts, encounter comments and The Mothership community forum.

Phase 4S.1 is a security-hardened, local-first application with production-capable Resend email and private Cloudflare R2 adapters, an authenticated staging gateway, least-privilege service configuration, durable encrypted database-backup storage, Railway/Neon configuration, CI, health checks, distributed maintenance leases and browser smoke tests. It is not deployed and no external account is required for local development.

## Requirements

- Node.js 22 LTS (the deployment and CI version is pinned by `.nvmrc`)
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

`APP_RUNTIME_MODE=local`, `TRUSTED_PROXY_MODE=local`, `STORAGE_DRIVER=local` and `EMAIL_DRIVER=development` are local-only defaults. Railway must set `APP_RUNTIME_MODE=production`; production validation requires an HTTPS canonical origin, non-local PostgreSQL, different strong secrets, `TRUSTED_PROXY_MODE=railway`, and the Phase 4C `r2`/`resend` drivers. Validation runs once when the Node server starts. The explicit local mode permits an optimized `next start` browser preview without pretending that its local services are launch-ready.

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

Development verification, password-recovery and security messages are delivered from the PostgreSQL outbox into ignored `.data/dev-mail` with restrictive permissions. This capture route returns 404 in production. Production never falls back to the development mailbox.

Unverified accounts may sign in to inspect account status and resend verification, but server-side authorization prevents them from commenting or posting. Account settings at `/account` support display name, biography, verification resend and confirmed deletion. Public profiles never expose email addresses.

## Transactional email and outbox

Set `EMAIL_DRIVER=development` locally or `EMAIL_DRIVER=resend` in production. Verification, password recovery, password-reset security notices, encounter notifications and optional community-report notifications are queued in `EmailOutbox`. Encounter and report notifications are committed in the same PostgreSQL transaction as their business record. A provider failure therefore cannot erase an already saved encounter.

The worker claims messages atomically, recovers processing locks older than ten minutes, supplies a stable Resend idempotency key, retries transient failures with bounded exponential backoff and moves permanent/exhausted failures to `DEAD_LETTER`. Hard bounces, complaints and provider suppressions create a keyed recipient suppression without storing another copy of the address. The Security page in Mission Control and `npm run email:status` expose delivery state and safe error codes without message bodies, secure URLs or full recipient addresses.

Run one delivery pass with:

```bash
npm run email:process
```

Railway should run `npm run email:worker` as one dedicated continuously running worker. A PostgreSQL lease prevents overlapping worker passes, atomic message claims prevent duplicate ownership, and stale message locks recover after ten minutes. `SIGTERM` stops new passes and waits for the active pass before disconnecting. Do not use an unauthenticated HTTP job endpoint. Inspect failures with `npm run email:status`. `npm run email:cleanup` is a dry run; add `-- --apply` only after reviewing the count. Delivered/suppressed rows are retained for 30 days and dead letters for 90 days.

### Resend configuration

Production requires `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_SENDING_DOMAIN`, `RESEND_WEBHOOK_SECRET` and `ADMIN_NOTIFICATION_EMAIL`. Verify the sending domain in Resend, publish the supplied SPF and DKIM records, and establish a reviewed DMARC policy. Use a dedicated transactional subdomain. Open and click tracking must be disabled on the Resend domain used for authentication messages; the Resend send-email API does not expose a per-message tracking switch.

Create a Resend webhook pointing to `/api/webhooks/resend` for `email.delivered`, `email.delivery_delayed`, `email.failed`, `email.bounced`, `email.complained` and `email.suppressed`. The route verifies the raw request with the Resend signing secret before processing it and records the `svix-id`, making repeated events idempotent. Never log raw webhook bodies, verification/reset URLs or email bodies.

To rotate Resend credentials, create the replacement key, update Railway’s secret, restart the web and worker services, confirm a controlled delivery, then revoke the old key. Rotate the webhook signing secret separately and update the application before accepting events signed only by the new secret. No real Resend request is made by the automated suite.

## Community workflows

- Anyone can read published discussions and encounter comments.
- Only signed-in, verified, non-suspended members can create discussions, comment or reply.
- Encounter comments support one reply level, editing/deletion by the author, reporting and pagination.
- The Mothership supports configurable categories, search, filtering, newest/recent activity sorting, pagination, pinned/locked topics and dedicated topic URLs.
- Reports accept a validated reason and optional details. Reports never remove content automatically.
- Deleted accounts leave readable content attributed to “Deleted member”, avoiding broken discussions.

PostgreSQL-backed rate limits, strict internal redirects, Origin and Fetch Metadata validation, Next.js Server Action CSRF checks, server-side validation, ownership checks and database-backed role/suspension checks protect mutations. React renders member text as text rather than raw HTML. Run `npm run security:cleanup-rate-limits` from a trusted scheduled production job; the application also attempts an hourly best-effort cleanup of rows older than 48 hours.

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

### Administrator MFA

TOTP MFA is mandatory for every administrator. Better Auth encrypts the authenticator secret and recovery-code set with `BETTER_AUTH_SECRET`; recovery codes are single-use. Existing CLI-created administrators are not locked out: after their next password sign-in they are sent to `/admin/mfa/setup`, where they confirm their password, add the supplied `otpauth://` setup key to an authenticator, save the ten one-time recovery codes offline, and verify a current code.

Subsequent administrator sign-ins require a TOTP or recovery code before a session is created. Viewing private contributor information or unpublished evidence, publishing/unpublishing/deleting encounters, changing recovery codes, and suspending members require a fresh second-factor verification. The per-session step-up window is ten minutes. Mission Control’s Security page can replace recovery codes after password confirmation; previous codes become invalid immediately. There is no MFA bypass or public administrator-enrolment route.

Local MFA test:

1. Create an administrator with `npm run admin:create` as shown above.
2. Visit `/admin`, sign in with the CLI credentials and follow `/admin/mfa/setup`.
3. Add the displayed setup key to 1Password, Bitwarden, Google Authenticator, Microsoft Authenticator or another standards-compatible TOTP application.
4. Save the recovery codes outside the project and submit a current six-digit code.
5. Sign out and sign back in to test the normal second-factor challenge.
6. Open an encounter in Mission Control to test the ten-minute step-up prompt.
7. Test one recovery code once, then confirm it is rejected if reused.

Never store real recovery codes in `.env`, documentation, source control, screenshots or support logs. If all factors are lost, use a documented operator recovery procedure with direct database/CLI access and identity verification; do not add an HTTP bypass.

## Encounter privacy and media

- Registration is never required to submit an encounter.
- Public reports begin as `PENDING`; only `PUBLISHED` records appear publicly.
- Contributor contact information is stored separately and is never returned by public projections.
- JPEG, PNG and WebP uploads are signature-checked, limited to five files, 10 MB per file, 50 MB aggregate and 40 million pixels per image, then rotated, resized and re-encoded as WebP so metadata is discarded.
- Originals are not retained. Processed images live in ignored `.data/private-media` and are served by an access-controlled route.
- A private recovery token supports `/removal-request`; verified removal unpublishes the encounter, revokes public media access and erases contact details.

Set `STORAGE_DRIVER=local` for the ignored development store or `STORAGE_DRIVER=r2` for the production adapter. Both use the same protected media route; the application never emits an R2 public URL or presigned GET URL.

Image processing is limited to two concurrent requests with at most four waiting requests per application instance. Invalid uploads and submissions consume rate-limit capacity. The application rejects a declared multipart body above 52 MB before calling `formData()`, but this does **not** stop a reverse proxy or framework from buffering bytes first. Railway must enforce an upstream request-size ceiling close to 52 MB, request/header timeouts, and must not expose the service around its public proxy. Slow-client and abandoned-request protection is an infrastructure control. Sharp uses in-memory buffers and disables its file cache, so there are no application temporary upload files to sweep.

### Cloudflare R2 and media lifecycle

Production requires `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_REGION` (normally `auto`). Create a private bucket, disable the public `r2.dev` URL and bucket listing, and issue a bucket-scoped token limited to object read/write/delete/list operations. EU jurisdiction can be selected when the bucket is created; use the corresponding account endpoint. The runtime credential must not manage buckets, DNS or account settings.

Media moves through `PENDING_UPLOAD`, `READY`, `FAILED`, `DELETING` and `REMOVED`. A database record is created before an object write and public or administrator media responses require `READY`. Publication approves only ready objects. Removal revokes access in PostgreSQL before object deletion, so a failed R2 deletion cannot leave a public URL. Storage failures retain a safe error code and can be retried.

Reconciliation is dry-run by default:

```bash
npm run media:reconcile
npm run media:reconcile -- --apply
```

It repairs confirmed object/record state, retries `DELETING` records, marks abandoned pending uploads failed and identifies objects with no database record. The apply mode deletes only confirmed orphan keys. Review every dry run and back up the database and bucket before using apply in production. The migration backfills existing local media as ready or removed and does not relocate or delete it.

Contributor removal continues to unpublish immediately and erase private contact information; it does not silently establish a new evidence-deletion policy. The owner must approve a retention/deletion schedule before launch. Administrative deletion records an audit action and retries failed object deletion through reconciliation.

## Deployment and operations

Railway, Neon, CI, maintenance, backup/restore, monitoring, staging, rollback and incident instructions are in [docs/OPERATIONS.md](docs/OPERATIONS.md). The provider-specific, approval-gated staging preflight and complete environment inventory are in [docs/STAGING.md](docs/STAGING.md). `railway.json` configures Railpack, a reproducible `npm ci` build, `/health/ready`, and bounded restarts; it does not deploy anything or contain credentials.

Hosted staging is fail-closed behind separate HTTP gateway credentials configured with `APP_ENVIRONMENT=staging`, `STAGING_ACCESS_ENABLED=true`, `STAGING_ACCESS_USERNAME` and a random `STAGING_ACCESS_PASSWORD` of at least 32 characters. Only exact GET liveness/readiness checks and the signed Resend webhook POST are exempt. These credentials are not member or administrator credentials and must be supplied only to the web service and authorised browser tests.

`/health/live` proves only that the process responds. `/health/ready` performs one lightweight database query with a two-second application timeout and returns a generic 503 on failure. Neither endpoint exposes configuration, database identifiers or internal error text. Use readiness for Railway deployment activation and liveness for independent uptime monitoring.

The operator-only `PUBLIC_SUBMISSIONS_ENABLED=false` switch rejects new encounter submissions before request-body parsing and replaces the public form with a clear paused state. It does not affect existing content or community access. Railway/proxy request-size and slow-client controls are still required because application code cannot prevent upstream buffering.

## Database and migrations

Prisma migrations live in `prisma/migrations`. Phase 4D adds only `OperationalLease`, used to serialize maintenance across application instances and recover automatically after lease expiry. `DATABASE_URL` is the pooled application URL; `DIRECT_URL` is the direct migration URL. Hosted validation requires TLS on both and rejects a pooled Neon endpoint in `DIRECT_URL`. The web and worker must not receive `DIRECT_URL`; `npm run db:migrate` validates a migration-only environment before running Prisma exactly once as a controlled release job—never in every replica start command.

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
npm run ops:test-migrations
npm run ops:test-backup
npm run test:browser
```

GitHub Actions repeats installation, isolated PostgreSQL migration, repository security checks, lint, typecheck, database-backed tests, build, production audit and headless browser journeys. The browser runner creates and drops a uniquely named disposable database and uses local mail/media adapters. Tests never call real Resend or R2 accounts.

The nonce-based Content Security Policy is generated in `proxy.ts`. The root layout is dynamic so Next.js can attach the nonce to framework assets. Global response headers also provide `nosniff`, strict referrer policy, Permissions Policy, clickjacking protection and same-origin opener isolation. HSTS is emitted only when a production build is configured with an HTTPS canonical origin, so local HTTP development is unaffected.

For Railway, set `TRUSTED_PROXY_MODE=railway` and accept the client address only from Railway’s overwritten `X-Real-IP` header. Do not route public traffic directly to the application or preserve client-supplied forwarding headers. `X-Forwarded-For` and Cloudflare-specific headers are intentionally ignored by the application.

## Known limitations and production checklist

- Real Resend domain verification, deliverability, webhook delivery and bounce behaviour remain unverified until controlled staging credentials are supplied.
- Real R2 permissions, EU-jurisdiction endpoint behaviour, latency and restore procedures remain unverified until a private staging bucket is supplied.
- Railway must provide upstream aggregate-body, slow-request and timeout enforcement; application checks occur after some platform buffering may already have happened.
- Rate limiting is PostgreSQL-backed and works across multiple application instances. It does not yet provide distributed bot challenges or a provider WAF.
- Community posts are plain text with no images, private messages, realtime chat, voting or AI moderation by design.
- MFA is intentionally administrator-only in Phase 4B; member MFA and passkeys are optional future work.
- The contributor-evidence retention/deletion schedule still needs owner and legal approval.

### `BETTER_AUTH_SECRET` rotation and MFA recovery-code follow-up

`BETTER_AUTH_SECRET` encrypts administrator TOTP secrets and Better Auth’s recovery-code set. Changing it without a migration makes existing MFA material unreadable and can lock every administrator out. Never rotate it as a routine environment-only change. Preserve the previous secret in the approved secrets manager, take and test a database backup, rehearse in staging, maintain a verified operator recovery path, then deliberately reset/re-enrol every administrator before retiring the old secret. There is no HTTP bypass.

Better Auth 1.7.27 supports plain or reversibly encrypted backup-code storage, not a native one-way-hashed mode; Phase 4B uses the safer supported encrypted option and codes are single-use. A future security review should replace this with one-way per-code hashes if the authentication library adds support or if a carefully audited custom verifier is introduced. TOTP seeds themselves must remain decryptable for verification.

Before launch, connect and validate Resend and R2 in isolated staging, use managed PostgreSQL with encrypted and restore-tested backups, configure the Railway web and outbox worker services, limits, HTTPS, monitoring, error reporting, audit retention and cost alerts, and complete the privacy/terms and accessibility review. Never commit `.env`, `.data`, database files, uploads, API keys, TOTP secrets or recovery codes.
