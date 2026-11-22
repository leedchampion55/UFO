# What the UFO?!

A cinematic Cornish paranormal archive with moderated encounter publishing, free member accounts, encounter comments and The Mothership community forum.

Phase 4B is a security-hardened, local-first application. It is not deployed and deliberately refuses a production runtime until Phase 4C provides supported Resend email and private R2 storage drivers.

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

Development verification and password-recovery messages are written with restrictive permissions beneath ignored `.data/dev-mail`. This capture route returns 404 in production. Production delivery is deliberately not bypassed: `lib/dev-mail.ts` fails closed in production until a transactional email adapter is configured. Configure a reputable provider, verified sender, delivery monitoring and the correct `BETTER_AUTH_URL` before launch.

Unverified accounts may sign in to inspect account status and resend verification, but server-side authorization prevents them from commenting or posting. Account settings at `/account` support display name, biography, verification resend and confirmed deletion. Public profiles never expose email addresses.

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

Production should replace local media storage with private object storage while preserving authorization and revocation checks.

Image processing is limited to two concurrent requests with at most four waiting requests per application instance. Invalid uploads and submissions consume rate-limit capacity. The application rejects a declared multipart body above 52 MB before calling `formData()`, but this does **not** stop a reverse proxy or framework from buffering bytes first. Railway must enforce an upstream request-size ceiling close to 52 MB, request/header timeouts, and must not expose the service around its public proxy. Slow-client and abandoned-request protection is an infrastructure control. Sharp uses in-memory buffers and disables its file cache, so there are no application temporary upload files to sweep.

## Database and migrations

Prisma migrations live in `prisma/migrations`. The Phase 4B migration adds Better Auth TOTP records, an administrator MFA flag and a per-session strong-authentication timestamp without resetting existing records. Username and canonical-username uniqueness remain enforced by database constraints. Public registration compensates a failed profile write by deleting the just-created authentication user; concurrent username collisions are database-tested and do not leave orphaned users.

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

The database-backed suite covers registration integrity and collisions, verification, password-reset session revocation, real TOTP enrolment/challenges, invalid factors, single-use recovery codes, redirect/origin/CSRF controls, proxy trust, upload boundaries, rate-limit cleanup, security headers, suspension, community moderation, and all important Phase 2 privacy and publishing regressions.

The nonce-based Content Security Policy is generated in `proxy.ts`. The root layout is dynamic so Next.js can attach the nonce to framework assets. Global response headers also provide `nosniff`, strict referrer policy, Permissions Policy, clickjacking protection and same-origin opener isolation. HSTS is emitted only when a production build is configured with an HTTPS canonical origin, so local HTTP development is unaffected.

For Railway, set `TRUSTED_PROXY_MODE=railway` and accept the client address only from Railway’s overwritten `X-Real-IP` header. Do not route public traffic directly to the application or preserve client-supplied forwarding headers. `X-Forwarded-For` and Cloudflare-specific headers are intentionally ignored by the application.

## Known limitations and production checklist

- Transactional email needs a production provider and credentials; local capture is development-only.
- Private evidence still needs the Phase 4C R2 adapter. Local filesystem storage is not accepted by production environment validation.
- Railway must provide upstream aggregate-body, slow-request and timeout enforcement; application checks occur after some platform buffering may already have happened.
- Rate limiting is PostgreSQL-backed and works across multiple application instances. It does not yet provide distributed bot challenges or a provider WAF.
- Community posts are plain text with no images, private messages, realtime chat, voting or AI moderation by design.
- MFA is intentionally administrator-only in Phase 4B; member MFA and passkeys are optional future work.

Before launch, complete Phase 4C production email and R2 storage, use managed PostgreSQL with encrypted and restore-tested backups, configure Railway limits, HTTPS, monitoring, error reporting, audit retention and cost alerts, and complete the privacy/terms and accessibility review. Never commit `.env`, `.data`, database files, uploads, TOTP secrets or recovery codes.
