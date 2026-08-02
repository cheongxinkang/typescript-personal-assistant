# Deploying to the N95

Requires kubeconfig access to the k3s node — see `agent_home_v1`'s setup
instructions if that's not configured on this machine yet.

## Build and push the image (off-box — the N95 serves, it does not compile)

```bash
docker build --platform linux/amd64 -t ghcr.io/cheongxinkang/typescript-personal-assistant:latest .
docker push ghcr.io/cheongxinkang/typescript-personal-assistant:latest
```

## Apply the manifests

```bash
kubectl apply -f deploy/namespace.yaml
kubectl create secret generic assistant-secrets \
  --namespace personal-assistant \
  --from-env-file=.env
kubectl apply -f deploy/deployment.yaml
kubectl apply -f deploy/service.yaml
```

## Verify

```bash
kubectl -n personal-assistant get pods
kubectl -n personal-assistant logs -l app=assistant-server -f
kubectl -n personal-assistant port-forward svc/assistant-server 3000:80
curl http://localhost:3000/health
```

Then send a message in the configured Discord channel and confirm a reply,
same as the local verification in
`docs/product-specs/phase-1-vertical-slice.md`'s Stage 1 exit criterion —
this time "from a pod on the N95" rather than a local process.

## Rollout / duplicate-tick check (relevant from Stage 5 onward)

```bash
kubectl -n personal-assistant rollout restart deployment/assistant-server
kubectl -n personal-assistant get pods -w
```

Confirm the old pod terminates before the new one is `Running` — `strategy:
Recreate` in `deployment.yaml` is what guarantees this, not something to take
on faith.
