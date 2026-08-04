# Deploying to the N95

Requires kubeconfig access to the k3s node — see `agent_home_v1`'s setup
instructions if that's not configured on this machine yet.

The repo (and its linked GHCR package) is private, so both `docker push`
and the cluster's image pull need credentials — a `gh` CLI token with
`write:packages` scope covers both. If `gh auth status` doesn't show that
scope: `gh auth refresh -h github.com -s write:packages`.

## Build and push the image (off-box — the N95 serves, it does not compile)

```bash
gh auth token | docker login ghcr.io -u <your-github-username> --password-stdin
docker build --platform linux/amd64 -t ghcr.io/cheongxinkang/typescript-personal-assistant:latest .
docker push ghcr.io/cheongxinkang/typescript-personal-assistant:latest
```

## First-time cluster setup

Only needed once per cluster — the namespace, the image pull secret, and
Postgres itself don't exist until created.

```bash
kubectl apply -f deploy/namespace.yaml

# Image pull secret — the node needs this to pull from the private package.
kubectl create secret docker-registry ghcr-pull-secret \
  --namespace personal-assistant \
  --docker-server=ghcr.io \
  --docker-username=<your-github-username> \
  --docker-password="$(gh auth token)" \
  --docker-email=<your-email>

# Postgres — generate a real password, don't reuse the REPLACE_ME
# placeholder in the checked-in manifest. Verify byte length after
# substituting; a shell pipeline mangling the password (e.g. a stray
# trailing character) causes a hard-to-diagnose auth failure baked into
# initdb, not a schema error — this happened once, see the Stage 1
# follow-up commit.
PGPASS=$(openssl rand -hex 16)
sed "s/REPLACE_ME/$PGPASS/" deploy/postgres.yaml | kubectl apply -f -
kubectl -n personal-assistant get secret postgres-credentials \
  -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d | wc -c   # expect 32

# Wait for Postgres to be ready before creating assistant-secrets below.
kubectl -n personal-assistant get pods -w
```

## Apply the app secret and deployment

`assistant-secrets` bundles the Discord/Anthropic credentials from `.env`
plus a `DATABASE_URL` pointing at the in-cluster Postgres Service — never
`localhost`, which only makes sense outside the cluster.

```bash
# Build a temp env file: everything from .env except DATABASE_URL, plus
# the in-cluster one. --from-env-file (not --from-literal) keeps the
# values out of the process list / shell history.
grep -v '^DATABASE_URL=' .env > /tmp/deploy.env
echo "DATABASE_URL=postgres://postgres:$PGPASS@postgres.personal-assistant.svc.cluster.local:5432/personal_assistant" \
  >> /tmp/deploy.env
kubectl create secret generic assistant-secrets \
  --namespace personal-assistant --from-env-file=/tmp/deploy.env
rm -f /tmp/deploy.env

kubectl apply -f deploy/deployment.yaml
kubectl apply -f deploy/service.yaml
```

**Updating an existing secret** (e.g. adding `BASIC_AUTH_USER`/
`BASIC_AUTH_PASSWORD` for phase_2a-db-visibility.md): `kubectl create
secret` fails if the secret already exists. Delete and recreate rather than
trying to patch individual keys:

```bash
kubectl -n personal-assistant delete secret assistant-secrets
# then the grep/create block above, unchanged
```

A pod restart (`kubectl rollout restart deployment/assistant-server`) is
still required after this — `envFrom` is read at container start, not live.

## Verify

```bash
kubectl -n personal-assistant get pods
kubectl -n personal-assistant logs -l app=assistant-server -f
kubectl -n personal-assistant port-forward svc/assistant-server 3000:80
curl http://localhost:3000/health
```

Then send a message in the configured Discord channel and confirm a reply.
Don't stop at "a reply arrived" — query the row it should have written
directly:

```bash
kubectl -n personal-assistant exec postgres-0 -- psql -U postgres -d personal_assistant \
  -c "select provider, model, tool_calls, outcome from turn_usage order by created_at desc limit 3;"
kubectl -n personal-assistant exec postgres-0 -- psql -U postgres -d personal_assistant \
  -c "select title, starts_at from events order by created_at desc limit 3;"
```

## Rollout / duplicate-tick check (relevant from Stage 5 onward)

```bash
kubectl -n personal-assistant rollout restart deployment/assistant-server
kubectl -n personal-assistant get pods -w
```

Confirm the old pod terminates before the new one is `Running` — `strategy:
Recreate` in `deployment.yaml` is what guarantees this, not something to
take on faith. Watched at 1-second intervals during the real verification:
at no observed instant did two pods coexist.

## Redeploying after a code change

```bash
docker build --platform linux/amd64 -t ghcr.io/cheongxinkang/typescript-personal-assistant:latest .
docker push ghcr.io/cheongxinkang/typescript-personal-assistant:latest
kubectl -n personal-assistant rollout restart deployment/assistant-server
```

`:latest` means the running pod won't notice a new push on its own —
`rollout restart` is what actually pulls it, and it's also what exercises
the duplicate-tick mitigation above on every redeploy.
