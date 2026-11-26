# Phase 4S staging readiness runbook

**Prepared:** 26 November 2026  
**Source checkpoint:** `86507e86fbc86befda20e21ac80f50a0eaef137b` (`phase-4d-complete`)  
**Preparation branch:** `codex/phase-4s-staging`

This is a preparation document, not evidence of a deployment. No Railway, Neon, Cloudflare R2 or Resend account, resource, credential, DNS record or public staging URL has been created or connected.

## Decision and preflight result

The application can run on the proposed staging stack:

- Railway web service and private email worker, in Amsterdam.
- A separate Neon PostgreSQL project, benchmarked in Frankfurt and London before the fixed project region is chosen.
- Two private Cloudflare R2 buckets in the EU jurisdiction: live staging evidence and backup evidence.
- A separate Resend staging configuration and transactional subdomain.

Node.js 22, `next start`, Prisma 7 with the PostgreSQL adapter, Better Auth, Sharp, the R2 S3 adapter and Resend API client are compatible with a conventional Railway Node service. The checked-in `railway.json` uses Railpack, `npm ci && npm run build`, `npm run start`, `/health/ready`, a 120-second activation timeout and bounded restart policy. The email worker is `npm run email:worker`; migrations are `npm run db:migrate` and must run once in a controlled job.

### Activation blockers requiring approval for a code/configuration change

Do not expose staging until these are resolved and tested:

1. **Authenticated staging barrier.** The repository has no staging access gateway. Add an application-level barrier enabled only by an explicit staging environment value. Protect every route except `GET /health/live`, `GET /health/ready` and the exact signed `POST /api/webhooks/resend` endpoint. Require HTTPS, constant-time credential comparison, a rate-limited challenge and sealed Railway-only credentials. Add `X-Robots-Tag: noindex, nofollow, noarchive` and a visible staging banner as defence in depth; neither is an access control.
2. **Service-specific environment validation and least privilege.** `validateRuntimeEnvironment()` currently requires `DIRECT_URL`, Better Auth, R2 and Resend configuration in every production-mode process. That would give the web and worker a direct migration credential and give the email worker unrelated R2 secrets. Split validation by role (`web`, `email-worker`, `maintenance`, `migration`) so each service receives only what it uses. The web needs the pooled database URL, auth, email/webhook and live R2 settings; the worker needs the pooled URL, rate-limit pseudonymisation secret and Resend settings; the migration job alone receives `DIRECT_URL`.
3. **Durable logical-backup destination.** `ops:backup-db` creates an encrypted file on local disk and assumes `pg_dump`, `pg_restore`, `openssl` and `shasum` are installed. Railway ephemeral storage is not a backup destination, and the current Railpack definition does not prove the PostgreSQL tools are present. Use a purpose-built private backup job image and upload encrypted output to a separate restricted bucket, or run the initial staging drill from a trusted operator machine. Verify download and isolated restoration before calling the backup operational.

These are independent of the existing site design and public functionality. No fix was applied during this preflight.

### Configuration warnings to validate in the provider dashboard

- `railway.json` describes the web service. The worker and every scheduled job must override its start command and must not inherit the web health check.
- Generate the Railway staging domain before the build and set the exact HTTPS origin in both `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL`; `NEXT_PUBLIC_*` values are embedded during `next build`.
- Keep one web replica initially. Multiple Next.js replicas require a shared `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, a deployment identifier and a review of cross-instance caching.
- Railway health checks decide deployment activation; they are not continuous uptime monitoring.
- The application rejects an over-52 MB declared encounter request before `formData()`, but this cannot prevent platform buffering. Confirm Railway's effective body-size and slow-request limits with a synthetic boundary test before allowing submissions.
- Pinning through `package-lock.json` makes `npm ci` reproducible, although several manifest entries still use `latest`; review and pin those manifest ranges before the first production release.

## 1. Railway staging setup

Do these steps only after the owner approves resource activation and the access-gate change has passed local tests.

1. Create an isolated Railway project or isolated staging environment named clearly as non-production. Select Amsterdam for the web and worker.
2. Connect the GitHub repository to the `codex/phase-4s-staging` branch. Disable automatic deployments; use **Deploy Latest Commit** manually after CI succeeds. Never connect `master` for this exercise.
3. Create `ufo-staging-web` from the repository. Keep the checked-in Railpack/build/start settings and generate one Railway HTTPS domain. Do not share the URL yet.
4. Configure one replica initially. Start with 1 GB RAM and an effective ceiling of 1 vCPU; review actual Sharp/upload peaks. Set a 30-second deployment drain period and retain the provider-managed `PORT`.
5. Set `/health/ready` as the deployment health path. Monitor `/health/live` independently and `/health/ready` as a database-dependency signal.
6. Create `ufo-staging-email-worker` from the same commit. Override the start command with `npm run email:worker`, do not generate a public domain, and remove the inherited HTTP health check. Use a single worker instance; the PostgreSQL operational lease also prevents overlapping work.
7. Create a manual one-off migration job with `npm run db:migrate`. It receives the direct migration URL only while running. Follow with `npx prisma migrate status --config prisma7.config.ts`.
8. Create scheduled jobs only after their dry runs have been inspected. Each job uses the same commit but an explicit command and no public domain:

| Job | Initial schedule | Command and policy |
|---|---:|---|
| Rate-limit cleanup | Daily | `npm run security:cleanup-rate-limits`; automatic |
| Email cleanup | Daily | `npm run email:cleanup`; dry run until retention is approved |
| Media reconciliation | Hourly | `npm run media:reconcile`; dry run |
| Failed-deletion retry | Hourly | `npm run media:retry-deletions`; inspect before any `--apply` |
| Evidence backup | Daily | `npm run media:backup -- --apply`; only after backup R2 is verified |
| Logical database backup | Daily | Do not schedule until the durable backup-job blocker above is resolved |

9. Set usage alerts at 50%, 80% and 100% of the approved monthly ceiling. Use a project limit low enough that an accidental worker loop cannot create an open-ended bill.
10. Give the public web service the exact staging gateway exception set only. The worker and maintenance jobs remain private.

Railway's Free plan sleeps and does not include cron jobs or region choice. A controlled, always-on staging rehearsal therefore normally needs Hobby, currently a $5 monthly minimum including $5 of usage. Resource use above the included amount is metered.

## 2. Neon staging database

1. Create a **new Neon project**, not a production branch and not a copy of any real database. A Neon project region cannot later be changed.
2. Benchmark the Amsterdam Railway service against Neon Frankfurt (`aws-eu-central-1`) and London (`aws-eu-west-2`). Prefer Frankfurt if it provides the lower application-to-database latency; browser proximity is secondary to server/database latency.
3. Create separate database roles where supported:
   - an application role for runtime CRUD;
   - a migration owner for `DIRECT_URL` and schema changes;
   - a read/backup role appropriate to the logical export procedure.
4. Use the `-pooler` endpoint in `DATABASE_URL` and the non-pooler endpoint in `DIRECT_URL`. Both must contain `sslmode=require`. Begin with `DATABASE_POOL_MAX=5` per process, a 5-second connect timeout and 30-second idle timeout. Keep the sum of web and worker pools below the compute connection allowance.
5. Run the seven committed migrations once through the manual migration job. Never use `prisma db push`, `migrate dev`, a reset or a migration in every application start.
6. Run `npx prisma migrate status --config prisma7.config.ts`, then `/health/ready`, then the browser acceptance sequence.
7. Seed only synthetic staging accounts, discussions, encounters and generated test images. Create the administrator using the CLI and enrol a staging-only authenticator. Never import a development or production dump containing people.
8. Enable the longest approved restore-history window available for the chosen plan and perform an instant-restore/branch drill. Also retain the independent encrypted logical export described in the operations runbook.

The Free plan is suitable for an initial short preflight if its limits and 6-hour restore history are accepted. For a longer staging rehearsal, Neon Launch is usage-based with no monthly minimum; the provider currently illustrates a typical intermittent 1 GB workload at about $15/month. Set compute autosuspend and a low maximum CU, then add usage alerts.

## 3. Cloudflare R2 staging evidence

Activation requires an R2 subscription checkout even when usage is expected to remain inside the free allowance. Obtain approval first.

1. Create `what-the-ufo-staging-evidence` with the **EU jurisdiction**, not merely a Western Europe location hint.
2. Create `what-the-ufo-staging-evidence-backup` separately, also EU jurisdiction. Prefer a separate account or stronger operator boundary for the eventual production backup.
3. Leave public access disabled. Do not enable a custom domain or the `r2.dev` URL. Evidence is retrieved only through the application's publication-checking route.
4. Create an account-level R2 token scoped to the one live bucket with **Object Read & Write**, not Admin. This is the web/media-maintenance credential.
5. Create distinct bucket-scoped credentials for the backup job. The web service must not receive backup credentials. The backup job needs source read/list and backup read/write/list; the backup bucket must not use the live credential.
6. Use the EU endpoint exactly: `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com`, with `R2_REGION=auto` and `R2_FORCE_PATH_STYLE=false`. The current validator and S3 client support this jurisdiction endpoint.
7. Run media reconciliation without `--apply`; then run the upload/publication tests below. Confirm object hashes during backup and restore one intentionally removed synthetic object.
8. Do not enable lifecycle deletion or Object Lock rules until the evidence-retention decision has been approved. Reconciliation remains dry-run-first.

Current R2 Standard pricing includes 10 GB-month storage, one million Class A operations and ten million Class B operations monthly; Standard overage is currently $0.015/GB-month, $4.50/million Class A and $0.36/million Class B, with no internet egress fee. Small synthetic staging use should normally remain inside the allowance, but billing is usage-based and rounded to billing units.

## 4. Resend staging email

1. Create an isolated Resend configuration. Start with the official test recipients:
   - `delivered@resend.dev`
   - `bounced@resend.dev`
   - `complained@resend.dev`
   - `suppressed@resend.dev`
2. Point the staging encounter notification to a test address or an owner-controlled staging inbox, never a real member list.
3. Create one webhook endpoint for the exact staging URL `/api/webhooks/resend` and subscribe to delivered, delayed, failed, bounced, complained and suppressed events.
4. Store the webhook signing secret only in sealed Railway variables. The endpoint must remain reachable through the staging gateway exception, but it already requires the raw signed payload and Svix headers and rejects invalid requests.
5. Verify retry, stale-lock recovery, idempotency and dead-letter behaviour with the official test addresses. Do not log recipient addresses or message content.
6. To test registration verification and password recovery in a real synthetic mailbox, the owner must control and verify a domain or transactional subdomain. Resend requires a verified owned domain for normal sending. Prepare, but do not publish, the DKIM and SPF records Resend supplies; add a DMARC record in monitoring mode after reviewing the existing domain policy. Use a dedicated subdomain such as `notify.<owned-domain>` and disable open/click tracking for authentication mail.
7. Only after DNS approval and verification, send to synthetic inboxes owned for the test. Never send staging messages to real members.

Resend Free currently includes 3,000 messages per month, 100 per day, three domains and one webhook endpoint. Pro is currently $20/month for 50,000 messages and five endpoints. Free should be enough for staging if the daily limit is monitored and pay-as-you-go is not enabled.

## 5. Staging access and data-isolation plan

The Railway domain is an internet endpoint even when it is not advertised. The access barrier must be in place before the first externally reachable deployment.

Recommended first implementation:

- Introduce `APP_ENVIRONMENT=staging` and `STAGING_ACCESS_ENABLED=true`.
- Require sealed, high-entropy staging access credentials at the application proxy for all staging traffic.
- Exempt only `GET /health/live`, `GET /health/ready` and signed `POST /api/webhooks/resend`. Method and exact path are part of each exception.
- Do not exempt registration, submissions, admin routes, media routes, Next.js data endpoints or arbitrary `/api` paths.
- Browser smoke tests supply access credentials from their own sealed test environment.
- Return `X-Robots-Tag: noindex, nofollow, noarchive` everywhere and show a prominent `STAGING — SYNTHETIC DATA ONLY` identity after authentication.
- Keep staging secrets, cookies, MFA seeds, database roles, R2 buckets/tokens, Resend key/webhook and monitoring project separate from production.
- Rotate the staging gateway credential after contractors or testers lose access.

If a project-owned domain is later placed behind Cloudflare Access, it can replace the application Basic-auth-style gateway. That option requires a domain/DNS change and is outside this task. `robots.txt`, noindex, an obscure URL and Railway's generated hostname are not security controls.

## 6. Environment-variable inventory

Values below are names and handling rules only. Never place actual secrets in this file, tickets, logs or chat.

Service codes: **W** web, **E** email worker, **M** maintenance, **G** migration job, **B** backup/restore job. The table describes the least-privilege target after service-specific validation is implemented.

| Name | Purpose / supplier | Secret | Services | Must differ in production | Verification |
|---|---|:---:|---|:---:|---|
| `NODE_ENV` | Runtime mode; Railway/build | No | W E M | No | Exactly `production` in cloud |
| `APP_RUNTIME_MODE` | Enables production validation | No | W E M | No | `production`; never `local` |
| `APP_ENVIRONMENT` | Proposed staging identity/gate selector | No | W | Yes | Exactly `staging` |
| `NEXT_PUBLIC_APP_URL` | Canonical HTTPS staging origin | No/public | W E | Yes | Equals generated staging origin; browser metadata/links work |
| `BETTER_AUTH_URL` | Better Auth canonical origin | No | W | Yes | Exactly equals `NEXT_PUBLIC_APP_URL` |
| `TRUSTED_APP_ORIGINS` | Optional extra exact origins | No | W | Yes | Empty unless a reviewed exact origin is required |
| `BETTER_AUTH_SECRET` | Sessions and encrypted MFA material; operator-generated | Yes | W | Yes | At least 32 random bytes; distinct; login/MFA succeeds |
| `RATE_LIMIT_SECRET` | Pseudonymises rate-limit/email keys; operator-generated | Yes | W E | Yes | At least 32 random bytes and not auth secret |
| `TRUSTED_PROXY_MODE` | Railway client-IP trust policy | No | W | No | `railway`; spoofed forwarding test passes |
| `PUBLIC_SUBMISSIONS_ENABLED` | Emergency encounter-submission switch | No | W | Environment decision | `true` for acceptance; `false` returns safe 503 |
| `STAGING_ACCESS_ENABLED` | Proposed access barrier switch | No | W | Staging only | `true`; unauthenticated routes rejected |
| `STAGING_ACCESS_USERNAME` | Proposed staging gateway identity | Sensitive | W | Staging only | Sealed; never logged |
| `STAGING_ACCESS_PASSWORD` | Proposed high-entropy gateway secret | Yes | W/browser CI | Staging only | Sealed; wrong credential rejected/rate-limited |
| `DATABASE_URL` | Neon pooled runtime URL | Yes | W E M | Yes | `-pooler` host, `sslmode=require`, readiness succeeds |
| `DIRECT_URL` | Neon direct migration URL | Yes | G only | Yes | Non-pooler host, TLS, migration status succeeds |
| `DATABASE_POOL_MAX` | Per-process pg pool ceiling | No | W E M | Tune | Start `5`; total stays within Neon limit |
| `DATABASE_CONNECT_TIMEOUT_MS` | pg connect timeout | No | W E M | No | Start `5000`; outage produces bounded readiness failure |
| `DATABASE_IDLE_TIMEOUT_MS` | pg idle timeout | No | W E M | No | Start `30000`; no connection leak |
| `DATABASE_APPLICATION_NAME` | Safe connection label | No | W E M | Recommended | `what-the-ufo-staging-<role>` visible in Neon |
| `STORAGE_DRIVER` | Selects private storage | No | W M | No | `r2`; startup rejects local driver |
| `R2_ENDPOINT` | Cloudflare EU S3 endpoint | No | W M | Yes | Ends `.eu.r2.cloudflarestorage.com`; upload succeeds |
| `R2_BUCKET` | Private live staging bucket | No | W M | Yes | Exact staging bucket; public checks fail |
| `R2_ACCESS_KEY_ID` | Bucket-scoped application key | Yes | W M | Yes | Object operations work; bucket admin does not |
| `R2_SECRET_ACCESS_KEY` | Bucket-scoped application secret | Yes | W M | Yes | Stored sealed; rotate/retest |
| `R2_REGION` | R2 S3 region | No | W M | No | `auto` |
| `R2_FORCE_PATH_STYLE` | S3 addressing mode | No | W M | No | `false` |
| `EMAIL_DRIVER` | Selects production email adapter | No | W E | No | `resend`; development mailbox remains 404 |
| `RESEND_API_KEY` | Resend API credential | Yes | E and W webhook* | Yes | Test send accepted; key never logged |
| `RESEND_FROM` | Verified staging sender | No | E | Yes | Address belongs to configured verified domain |
| `RESEND_SENDING_DOMAIN` | Verified transactional domain | No | E | Yes | Matches sender domain |
| `RESEND_WEBHOOK_SECRET` | Signed webhook verification | Yes | W | Yes | Valid event accepted; forged/replay handling verified |
| `ADMIN_NOTIFICATION_EMAIL` | Staging notification target | Personal/sensitive | W | Yes | Test/owner-controlled address only |
| `MEDIA_BACKUP_DRIVER` | Backup object-store selector | No | B | No | `r2` |
| `MEDIA_BACKUP_R2_ENDPOINT` | Backup EU R2 endpoint | No | B | Yes | Jurisdiction endpoint verified |
| `MEDIA_BACKUP_R2_BUCKET` | Separate private backup bucket | No | B | Yes | Not equal live bucket |
| `MEDIA_BACKUP_R2_ACCESS_KEY_ID` | Backup bucket credential | Yes | B | Yes | Least-privilege copy succeeds |
| `MEDIA_BACKUP_R2_SECRET_ACCESS_KEY` | Backup bucket secret | Yes | B | Yes | Sealed and not present in web service |
| `MEDIA_BACKUP_R2_REGION` | Backup R2 region | No | B | No | `auto` |
| `MEDIA_BACKUP_R2_FORCE_PATH_STYLE` | Backup S3 addressing | No | B | No | `false` |
| `BACKUP_DATABASE_URL` | Direct/read-capable logical export URL | Yes | B | Yes | `pg_dump` succeeds without schema mutation rights |
| `BACKUP_DESTINATION` | Encrypted temporary/durable path | Sensitive | B | Yes | Durable upload and checksum verified; not ephemeral only |
| `BACKUP_RETENTION_DAYS` | Lists expired backups | No | B | Policy decision | Start `30`; script does not delete automatically |
| `BACKUP_ENCRYPTION_PASSPHRASE` | Encrypts logical dumps | Yes | B | Yes | Escrowed; isolated restore succeeds |
| `POSTGRES_BIN_DIR` | Optional path to matching pg tools | No | B | Platform-specific | `pg_dump --version` compatible with Neon |
| `RESTORE_DATABASE_URL` | Isolated restore target, ad hoc only | Yes | B | Every drill | Refuses live URLs; restored `SELECT 1` succeeds |
| `RESTORE_BACKUP_FILE` | Selected encrypted dump, ad hoc only | Sensitive | B | Every drill | Checksum and archive validation pass |
| `ERROR_MONITORING_ENDPOINT` | Optional privacy-minimised receiver | Sensitive config | W E M B | Yes | HTTPS; synthetic safe error appears |
| `ERROR_MONITORING_TOKEN` | Optional monitoring credential | Yes | W E M B | Yes | Sealed; rejected token does not break app |
| `RELEASE_SHA` | Release identifier | No | W E M | Every deploy | Set from `RAILWAY_GIT_COMMIT_SHA`; logs show commit |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Stable Server Action key for multiple instances | Yes | build + W | Yes | Required before >1 replica; valid base64 AES key |
| `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | Graceful drain window | No | W E | No | `30`; SIGTERM completes in-flight work |
| `PORT` | Railway-assigned listener port | No | W | Provider-managed | Do not override; liveness returns 200 |
| `RAILWAY_GIT_COMMIT_SHA` | Railway-provided release commit | No | W E M | Every deploy | Matches deployed checkpoint |

\* The current webhook verifier constructs the Resend SDK with the API key as well as the webhook secret. Reassess whether the API key can be removed from webhook-only verification during the least-privilege change.

Local-only values `PRIVATE_MEDIA_ROOT`, `DEV_MAIL_ROOT` and `EMAIL_DRIVER=development` must not exist in staging. Operator-only `ADMIN_EMAIL`, `ADMIN_NAME` and `ADMIN_PASSWORD` are supplied transiently to `npm run admin:create` and removed immediately; the password must never be stored as a persistent service variable. Test-only `BROWSER_FIXTURE_PATH`, `TEST_DATABASE_ADMIN_URL`, `NEXT_DIST_DIR` and restore inputs are not normal staging service configuration.

## 7. Cost guardrails

Prices are provider-published values observed on 26 November 2026 and must be rechecked immediately before activation. They exclude VAT, domain cost, currency conversion and monitoring providers.

| Provider | Lowest suitable staging choice | Likely small-staging cost | Important guardrail |
|---|---|---:|---|
| Railway | Hobby for always-on region choice and cron | **$5 minimum**, plausibly $5–15 with an idle web/worker and short jobs | Project usage limit; 50/80/100% alerts; one replica; no auto-deploy |
| Neon | Free for a short test or Launch for longer rehearsal | **$0–15 typical** intermittent small DB | Autosuspend, low max CU, usage alerts, short restore-history cost review |
| R2 | Standard live + backup buckets | Normally **$0** below free allowance | Activate only with approval; watch storage and Class A operations; no public URLs |
| Resend | Free | **$0** under 3,000/month and 100/day | No pay-as-you-go; daily quota alert; test recipients only |

Expected total for a quiet controlled staging month is approximately **$5–30**, but it is not a price guarantee. Railway's $5 Hobby fee is unavoidable if always-on services, region choice and cron are required. Cloudflare requires enabling an R2 subscription/checkout even when final usage is free-tier. Obtain explicit approval for the maximum monthly amount before any activation.

## 8. Exact staging acceptance procedure

Use a unique synthetic case prefix and synthetic images containing an obvious `STAGING TEST — NOT EVIDENCE` watermark. Record timestamps, safe IDs, expected/actual result and cleanup outcome; never record secrets.

1. **Access barrier first:** confirm the generated domain returns 401/403 without gateway credentials. Confirm only the two health GETs and the signed webhook POST bypass it. Confirm noindex headers and staging identity.
2. **Availability:** authenticated `GET /` renders original artwork/navigation at 1440×900 and 390×844; `/health/live` is 200. Before migrations, readiness may be 503 without details.
3. **Migrations:** run `npm run db:migrate` once, then Prisma migration status. `/health/ready` becomes 200. A second deploy must not rerun migrations.
4. **Administrator:** transiently run the CLI with a synthetic administrator. Enrol TOTP, store staging recovery codes outside the repository, sign out/in, test invalid TOTP and one single-use recovery code.
5. **Member verification:** register a unique synthetic member. Confirm posting is blocked before verification, the outbox worker sends the verification message, the real synthetic inbox link verifies, and sign-in/posting then works.
6. **Password recovery:** request recovery for the synthetic member, consume the emailed link once, verify reuse/expiry rejection and old-session revocation.
7. **Anonymous encounter:** submit a synthetic anonymous encounter with no account. Confirm a pending case and Matt notification without private story/contact data in the notification.
8. **Private upload:** attach a small watermarked JPEG. Confirm the R2 object exists only through authenticated S3 credentials and there is no public bucket/custom/r2.dev access.
9. **Pending denial:** unauthenticated application media request for pending evidence returns 404. An administrator without recent step-up cannot view it; fresh MFA permits the intended private review.
10. **Moderation:** open Mission Control, inspect the pending synthetic case, verify contact privacy and approve it.
11. **Published evidence:** the approved public case and evidence render through the application route. Confirm no R2 URL is exposed and protected response/cache headers remain correct.
12. **Revocation:** unpublish the case and immediately confirm the former evidence application URL returns 404 even if the object still exists.
13. **Community:** create a synthetic discussion and reply as a verified member; search/filter it; confirm an unverified or suspended account cannot post.
14. **Reporting:** report the synthetic post. Confirm rate limiting, Mission Control queue visibility and resolution audit history.
15. **Outbox:** run delivered, bounced, complained and suppressed test-recipient flows. Verify retries/dead letters and no sensitive log payloads.
16. **Webhook:** send a genuine Resend test event and confirm processing. Replay the same signed event and verify idempotence; forged/missing signatures must be rejected.
17. **Worker recovery:** stop the worker during a synthetic job, wait for/recreate the stale-lock condition, restart once and verify recovery without an unintended duplicate.
18. **Media maintenance:** run reconciliation dry, back up synthetic evidence, intentionally remove only the source test object, restore it by exact key, compare SHA-256 and rerun reconciliation. Do not apply orphan deletion.
19. **Database backup/restore:** create an encrypted logical dump, verify checksum/archive, restore into a separate empty Neon project/branch, run `SELECT 1` and inspect synthetic row counts. Record RPO/RTO. Never point restore at staging live.
20. **Rollback:** deploy a harmless second staging revision, then redeploy the previous Phase 4S image. Verify schema compatibility, health, login, media, moderation and worker state.
21. **Cleanup:** remove synthetic accounts/content through documented application/admin paths, retain only the test record required for audit, revoke temporary credentials and confirm no real address or image was introduced.

## 9. Recommended activation order

1. Approve the three blocker fixes and the maximum monthly staging budget.
2. Implement and locally test the staging gateway and service-specific environment validation; add their regression/browser tests.
3. Resolve the durable logical-backup job/tooling design and test it locally.
4. Create the isolated Neon project, choose region after measurement, create roles, and record pooled/direct URLs in the approved secrets manager.
5. Create private EU R2 live and backup buckets plus separate least-privilege tokens; keep public access disabled.
6. Create Resend staging configuration. Use official test addresses first; request separate approval before DNS records for a controlled transactional subdomain.
7. Create Railway staging web/worker/jobs with manual deployment, access barrier variables, resource/cost limits and no master auto-deploy.
8. Run the migration job exactly once, then deploy the web behind the tested barrier and the private worker.
9. Execute all 21 acceptance steps with synthetic data and record results.
10. Do not create or expose a production environment. Review the staging evidence, provider invoices, legal/retention decisions and remaining Phase 4A launch criteria first.

## 10. Provider references

- Railway: [pricing and limits](https://docs.railway.com/pricing/plans), [cost controls](https://docs.railway.com/pricing/cost-control), [GitHub autodeploy controls](https://docs.railway.com/deployments/github-autodeploys), [environments, cron and health-check concepts](https://docs.railway.com/platform/advanced-concepts).
- Neon: [regions](https://neon.com/docs/introduction/regions), [connection pooling](https://neon.com/docs/connect/connection-pooling), [secure connections](https://neon.com/docs/connect/connect-securely), [current pricing](https://neon.com/pricing).
- Cloudflare R2: [EU jurisdiction and endpoint](https://developers.cloudflare.com/r2/reference/data-location/), [bucket-scoped S3 credentials](https://developers.cloudflare.com/r2/api/tokens/), [public-bucket controls](https://developers.cloudflare.com/r2/buckets/public-buckets/), [pricing](https://developers.cloudflare.com/r2/pricing/).
- Resend: [verified domains](https://resend.com/docs/dashboard/domains/introduction), [webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests), [test recipients](https://resend.com/changelog/sending-test-emails), [pricing](https://resend.com/pricing).

