# Phase 4D operations runbook

This runbook describes prepared infrastructure. It does not prove or imply that Railway, Neon, Cloudflare R2, Resend, monitoring or backup destinations have been created or tested.

## Railway web service

- Runtime: Node.js 22 LTS, Railpack, `npm ci && npm run build`, `npm run start`.
- Start the web service directly from the repository. Do not add migrations to its start command.
- Health check: `/health/ready`, 120-second deployment timeout.
- Set `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=30`; Next.js receives SIGTERM and is allowed to finish in-flight work.
- Start with one Amsterdam replica, 1 vCPU and 1 GB RAM. Sharp and multipart uploads make 512 MB a poor production default. Review memory/CPU metrics before scaling.
- Set an upstream request-body ceiling close to 52 MB, header/read timeouts and slow-client protection. Application limits cannot stop bytes already buffered by Railway’s proxy.
- Set `RELEASE_SHA=${{RAILWAY_GIT_COMMIT_SHA}}`. Keep `PORT` provider-managed.
- Configure sealed service secrets rather than source files. The repository contains names and examples only.

Railway health checks activate a deployment; they are not continuous monitoring. Point an independent uptime service at `/health/live`, with `/health/ready` monitored separately as a database-dependency signal.

## Neon and release migrations

Use a pooled Neon URL ending in a `-pooler` hostname for `DATABASE_URL` and the direct endpoint for `DIRECT_URL`. Both must use `sslmode=require`. Begin with `DATABASE_POOL_MAX=5` per web/worker replica, a five-second connection timeout and 30-second idle timeout. The sum of all replica pools must remain below the Neon compute connection allowance.

Release order:

1. Confirm a recent database backup and successful restore drill.
2. Test the exact migration against isolated staging.
3. Inspect SQL for locks, destructive operations and table rewrites.
4. Run `npm run db:migrate` once in a one-off release job using `DIRECT_URL`.
5. Run `npx prisma migrate status --config prisma7.config.ts`.
6. Deploy the web and worker build from the same commit.
7. Confirm `/health/ready`, public pages, authentication, Mission Control, protected media and the outbox.

If migration application fails, stop the release and preserve logs. Do not reset or edit `_prisma_migrations` casually. Diagnose whether the migration committed; use `prisma migrate resolve` only after reviewing the database and Prisma guidance. Prefer a forward corrective migration. Roll back application code only when the existing database shape remains compatible.

`npm run ops:test-migrations` creates a uniquely named disposable local database, applies all migrations, verifies completed migration records and drops it. It never resets the configured development database.

## Worker and maintenance services

Use one private Railway worker service with the same application image but a **separate least-privilege variable set**, and start it with `npm run email:worker`. It has no public domain or inherited web health check. It receives the pooled database URL, pool settings, rate-limit pseudonymisation secret and Resend sending settings only—not Better Auth, `DIRECT_URL`, R2, webhook, administrator-notification or backup secrets. Atomic row claims, Resend idempotency keys, the global worker lease, ten-minute stale message-lock recovery and graceful SIGTERM handling minimize duplicate delivery. Delivery is still at-least-once across an upstream timeout; provider idempotency is part of the guarantee.

Recommended schedules:

| Operation | Schedule | Apply policy |
|---|---:|---|
| Email worker | Continuous, 10-second idle loop | Automatic |
| Expired rate limits | Daily | Automatic |
| Email outbox cleanup | Daily | Dry run; reviewed apply |
| Media reconciliation | Hourly | Dry run only by default |
| Failed media deletion retry | Hourly | `npm run media:retry-deletions` then reviewed `-- --apply`; only `DELETING` records |
| Private-media backup | Daily | `npm run media:backup -- --apply` |
| Database logical backup | Daily | Automatic to restricted destination |

All jobs use PostgreSQL `OperationalLease` records, so a second instance skips rather than overlaps. Leases expire after an interrupted process. Media reconciliation remains dry-run-first because orphan deletion is destructive and no unapproved retention rule may delete evidence.

## Database backup and restore

Targets are RPO ≤24 hours and RTO ≤4 hours. Neon snapshots/PITR are one layer; keep a daily independent logical export.

`npm run ops:backup-db` runs `pg_dump` in custom format, validates it with `pg_restore --list`, encrypts it with AES-256-CBC/PBKDF2, and uploads it to a private local or R2-compatible destination. The SHA-256 object is written last as the commit marker, then both objects are read back and verified. An incomplete or failed upload is removed and reported with a safe code. Supply `BACKUP_DATABASE_URL`, `BACKUP_ENCRYPTION_PASSPHRASE` and the dedicated `DATABASE_BACKUP_*` destination settings at runtime. The web and email worker must never receive these values.

Build the Railway database-backup job with `Dockerfile.backup`, not Railpack. It combines Node.js 22 with PostgreSQL 16 `pg_dump`/`pg_restore` and verifies the required tool versions during image build. It has no public domain or web health check. `npm run ops:backup-retention` is a dry run; add `-- --apply` only after reviewing the exact object count and approving retention.

Restore only into an isolated empty database:

```bash
RESTORE_DATABASE_URL="postgresql://.../isolated_restore?sslmode=require" \
RESTORE_BACKUP_KEY="database/what-the-ufo-YYYYMMDDTHHMMSSZ.dump.enc" \
RESTORE_CONFIRM_ISOLATED_DATABASE="true" \
DATABASE_BACKUP_DRIVER="r2" \
BACKUP_ENCRYPTION_PASSPHRASE="from-the-secrets-manager" \
npm run ops:restore-db
```

The restore script downloads the exact private key, validates its commit marker and checksum, decrypts in a mode-700 temporary directory, validates the archive, restores without ownership/privilege statements and runs `SELECT 1`. It requires explicit isolated-target confirmation and refuses a target equal to the runtime, migration or backup-source URL. `npm run ops:test-backup` performs a real local source→encrypted object transfer→retrieval→separate restore marker drill using two disposable databases, and tests both restore guards.

Production destinations, Neon snapshots, encryption-key escrow, alert delivery and real cloud RTO remain unverified until provider resources exist. Test a production-format restore monthly and record duration/result.

## Private evidence backup

Configure a second private R2 bucket and bucket-scoped credentials through `MEDIA_BACKUP_R2_*`; do not reuse the runtime credential or public access. `npm run media:backup` is a hash-producing dry run. `npm run media:backup -- --apply` copies missing or hash-different objects and rechecks source bytes. It never deletes from either location. Restore one exact key with `npm run media:restore -- --key=encounters/...`; add `-- --apply` only after inspecting the preview. Existing source objects are not overwritten unless `--overwrite` is explicit.

R2 durability is not protection from compromised application deletion credentials. Prefer a separate account/bucket, restricted backup credentials unavailable to the web service, retention/Object Lock where appropriate, daily inventory and quarterly sample restores. The local memory/local-storage tests prove copy/hash/restore logic only—not R2 permissions, jurisdiction, retention or provider recovery.

## Logging, monitoring and alerts

Operational events are one-line JSON with timestamp, level, safe event ID, release and allowlisted scalar fields. Health and worker events include correlation ID, route class, status and duration where relevant. Logs must never receive request bodies, cookies, tokens, email addresses, story text, recovery URLs, MFA material or evidence bytes.

Set `ERROR_MONITORING_ENDPOINT` and optional `ERROR_MONITORING_TOKEN` only for a provider endpoint that accepts the privacy-minimised event schema. Next.js `onRequestError` sends only a stable error ID, route type/path and release. It does not send exception messages, headers or session replay. Keep sampling and retention at the provider; session replay remains prohibited on authentication, reporting and administration pages.

Alerts should cover: liveness failure >5 minutes, readiness/database failure >2 minutes, sustained 5xx >2%, any email dead letter, repeated storage failures, any failed backup, three consecutive maintenance failures and 50/80/100% of the approved monthly budget.

## Isolated staging

Staging requires separate Railway web/worker services, Neon project/branch, private R2 live and backup buckets, Resend configuration/sending subdomain, secrets and monitoring project. Use synthetic accounts, encounters and images only. Never clone production personal data. Display a clear staging identity and keep it out of search indexing. Do not reuse production cookies, auth secret, MFA seeds, provider keys or canonical origins.

Before creating a public Railway domain, configure `APP_ENVIRONMENT=staging`, `STAGING_ACCESS_ENABLED=true`, a distinct gateway username, and a random gateway password of at least 32 characters. The Next.js proxy protects all pages, forms, API routes and assets. Only exact `GET /health/live`, exact `GET /health/ready`, and signed `POST /api/webhooks/resend` bypass the gateway. Hosted staging must use HTTPS. Noindex headers are emitted as defence in depth, not as the security boundary.

Run the full CI and browser suite, provider smoke messages, R2 publish/unpublish access checks, migration drill, backup restore and rollback rehearsal before promotion. No staging resource is configured by this repository.

## Incident and recovery safeguards

- **Secret rotation:** replace one credential at a time in staging, deploy, verify, then revoke the old credential. Changing `BETTER_AUTH_SECRET` makes existing encrypted TOTP/recovery material unreadable; follow the MFA recovery plan and re-enrol administrators deliberately.
- **Administrator MFA loss:** use verified operator/CLI and database access under a two-person recorded procedure. Never add an HTTP bypass.
- **Email failure:** preserve queued rows, stop the worker if delivery is unsafe, inspect safe codes, rotate credentials/webhook secret if compromised and resume. Do not export message bodies to logs.
- **Database incident:** disable writes if necessary, choose a restore point, restore into isolation, validate, then switch only through a documented change. Preserve the original database for investigation.
- **Media loss:** revoke public access in PostgreSQL first, restore exact objects from the backup bucket, verify hashes, reconcile dry-run, then re-enable approval.
- **Bad deployment:** stop rollout, redeploy the previous Railway image if schema-compatible, then verify health/auth/media/moderation. Prefer a forward migration fix.
- **Public submission abuse:** set sealed `PUBLIC_SUBMISSIONS_ENABLED=false` and deploy the variable change. The API fails closed before parsing bodies; existing content stays online. Re-enable only after the upstream and rate-limit issue is controlled.
- **Costs:** configure provider budgets and alerts; check Railway compute/egress, Neon compute/storage/history, R2 operations/storage and Resend volume weekly during launch.

## CI and smoke tests

`.github/workflows/ci.yml` grants read-only repository permission and uses pinned GitHub Actions. It starts isolated PostgreSQL 16, runs exact `npm ci`, migrations, tracked-file credential/runtime checks, lint, typecheck, database tests, production build, high-severity production audit and Chromium smoke tests. A separate job builds `Dockerfile.backup` without publishing it, verifies Node.js 22 and PostgreSQL 16 tools, creates an encrypted logical backup of synthetic data, and restores it into a different disposable database. It has no production secrets or deployment step.

`npm run test:browser` creates a unique disposable database and ignored mail/media directories, migrates/seeds them, runs desktop (1440 px) and mobile (390 px) Chromium journeys, then drops the database. Tests cover the home artwork/navigation, archive, anonymous evidence submission, administrator MFA, moderation/publication, protected-media access and unpublish revocation, member verification and a Mothership discussion. Never point `TEST_DATABASE_ADMIN_URL` or the browser suite at production.

## Connecting providers safely

1. Create isolated staging resources and record ownership/billing contacts.
2. Create least-privilege service identities and sealed secrets; do not paste credentials into tickets or Git.
3. Configure Neon pooled/direct TLS URLs and run the staging migration job once.
4. Create private live/backup R2 buckets with separate credentials and public access disabled.
5. Verify a Resend staging subdomain, webhook signature and suppressed/bounced flows.
6. Configure Railway web and private worker services, health path, drain time and resource limits.
7. Configure monitoring, uptime, backup destinations, budget alerts and alert recipients.
8. Run migration, browser, mail, R2, backup/restore and rollback rehearsals.
9. Review privacy/terms/retention and launch acceptance criteria before production DNS or traffic.
