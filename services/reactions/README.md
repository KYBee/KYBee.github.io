# Shared project reactions Worker

This Worker is the sole write boundary between the public portfolio and the
`kybee-reactions` D1 database. The browser receives an opaque signed visitor
token; D1 stores only its SHA-256 visitor hash together with target, emoji, and
creation time.

Never log an IP address, User-Agent, email address, raw visitor ID, bearer
token, visitor hash, or secret.

## Checked-in and secret configuration

- `wrangler.jsonc` contains the public manifest URL, rate-limit bindings, and,
  after provisioning, the non-secret D1 database UUID.
- `REACTION_HMAC_SECRET` is a Cloudflare Worker secret containing at least 32
  random bytes. It is never committed or stored in GitHub.
- `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are environment-scoped
  GitHub secrets in `production-reactions`. The workflow injects them only
  into the three Wrangler migration/deploy steps.
- `PUBLIC_REACTIONS_API_URL` is a public GitHub repository variable containing
  only the credential-free HTTPS Worker origin.

Rotating `REACTION_HMAC_SECRET` invalidates every existing browser token and
changes the derived visitor identity. Rotate it only for incident response,
never as part of routine deployment.

## Local verification

Run from the repository root:

```bash
npm ci
npm run test:worker
npm run reactions:typecheck
npm run reactions:dry-run
npm run reactions:migrate:local
npm run verify
```

The Vitest configuration supplies a test-only secret and local D1 database.
Do not create a real `.dev.vars` file merely to run the automated suite.

## One-time production provisioning

Run these commands only while `wrangler.jsonc` has no production
`d1_databases` block:

```bash
npx --no-install wrangler login
npx --no-install wrangler whoami
npx --no-install wrangler d1 create kybee-reactions \
  --binding DB \
  --location apac \
  --update-config \
  --config services/reactions/wrangler.jsonc
npx --no-install wrangler d1 migrations list kybee-reactions \
  --remote \
  --config services/reactions/wrangler.jsonc
npx --no-install wrangler d1 migrations apply kybee-reactions \
  --remote \
  --config services/reactions/wrangler.jsonc
openssl rand -hex 32 | \
  npx --no-install wrangler secret put REACTION_HMAC_SECRET \
    --config services/reactions/wrangler.jsonc
npx --no-install wrangler deploy --strict \
  --config services/reactions/wrangler.jsonc
```

`wrangler secret put` immediately publishes a secret-bearing Worker version.
The strict deploy then publishes the final checked-in code and configuration.
Inspect the generated diff before committing, and commit only the generated
non-secret D1 UUID. Never invent or document a database UUID, account ID, API
token, secret, or Worker origin.

Create the GitHub environment, enter secrets interactively, and set the public
repository variable from the exact HTTPS origin reported by Wrangler:

```bash
gh api --method PUT \
  repos/KYBee/KYBee.github.io/environments/production-reactions
gh secret set CLOUDFLARE_API_TOKEN --env production-reactions
gh secret set CLOUDFLARE_ACCOUNT_ID --env production-reactions
read -r "REACTIONS_PRODUCTION_ORIGIN?Worker HTTPS origin: "
PUBLIC_REACTIONS_API_URL="$REACTIONS_PRODUCTION_ORIGIN" \
  node scripts/validate-reactions-env.mjs --required
gh variable set PUBLIC_REACTIONS_API_URL \
  --body "$REACTIONS_PRODUCTION_ORIGIN"
gh secret list --env production-reactions
gh variable list
```

Use a least-privilege Cloudflare API token scoped to the target account's
Worker Scripts and D1 deployment operations. The interactive secret commands
keep values out of command arguments and shell history.

## Routine deployment and read-only smoke

The Pages deploy job and Worker deploy job share the FIFO
`production-release` queue. Up to 100 pending releases wait instead of
replacing one another. The Worker runs after the same commit's GitHub Pages
deployment succeeds, checks out and verifies that release SHA, and then
re-checks the latest successful main Pages release while holding the lock. A
stale release fails before Cloudflare credentials are available. It then lists
and applies additive migrations, deploys the Worker, and runs the read-only
smoke in that order.

Dispatch and watch the checked-in workflow from `main`, then repeat the
read-only smoke independently:

```bash
set -euo pipefail

MAIN_SHA="$(gh api repos/KYBee/KYBee.github.io/commits/main --jq .sha)"
DISPATCHED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
gh workflow run reactions-deploy.yml --ref main

RUN_ID=""
for attempt in $(seq 1 30); do
  RUN_IDS="$(
    gh run list \
      --workflow reactions-deploy.yml \
      --branch main \
      --event workflow_dispatch \
      --limit 100 \
      --json createdAt,databaseId,event,headSha |
      jq -r \
        --arg sha "$MAIN_SHA" \
        --arg since "$DISPATCHED_AT" \
        '.[] |
          select(
            .event == "workflow_dispatch" and
            .headSha == $sha and
            .createdAt >= $since
          ) |
          .databaseId'
  )"
  MATCH_COUNT="$(
    printf '%s\n' "$RUN_IDS" |
      sed '/^$/d' |
      wc -l |
      tr -d ' '
  )"

  if [[ "$MATCH_COUNT" -gt 1 ]]; then
    echo "More than one matching reactions workflow run was found." >&2
    exit 1
  fi
  if [[ "$MATCH_COUNT" -eq 1 ]]; then
    RUN_ID="$(printf '%s\n' "$RUN_IDS" | sed '/^$/d')"
    break
  fi
  if [[ "$attempt" -lt 30 ]]; then
    sleep 2
  fi
done

if [[ -z "$RUN_ID" ]]; then
  echo "A matching reactions workflow run was not found in time." >&2
  exit 1
fi
if [[ ! "$RUN_ID" =~ ^[0-9]+$ ]]; then
  echo "The matching reactions workflow run ID is invalid." >&2
  exit 1
fi

gh run watch "$RUN_ID" --exit-status
PUBLIC_REACTIONS_API_URL="$(
  gh variable get PUBLIC_REACTIONS_API_URL
)" node scripts/smoke-reactions-api.mjs
```

The smoke script may issue a signed visitor token, but it never calls `PUT`
and never creates a reaction row.

## Migration and rollback rules

- Never edit a migration after it has been applied remotely.
- Every new migration must be additive and backward-compatible with the
  previously deployed Worker.
- Never use `wrangler d1 execute`, reset, drop, delete, or truncate as a
  deployment or rollback mechanism.
- If a migration succeeds and deployment fails, fix forward or redeploy a
  compatible known-good Worker commit.
- A Worker rollback redeploys a reviewed full commit SHA compatible with the
  expanded schema; D1 is not rolled back.
- A UI rollback reverts only the UI and leaves the Worker and D1 data intact.
- Use D1 recovery only with explicit approval after stating the recovery point
  and possible data-loss window.

## Official references

- [Cloudflare Workers TypeScript](https://developers.cloudflare.com/workers/languages/typescript/)
- [Cloudflare Workers Vitest configuration](https://developers.cloudflare.com/workers/testing/vitest-integration/configuration/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare D1 batch API](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)
- [Cloudflare Rate Limiting bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [GitHub Actions variables](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables)
