# Smart Architecture Builder
### Production-grade cloud architecture generator

---

## Project structure

```
arch-builder/
├── frontend/
│   ├── index.html        ← Full SPA (HTML + CSS + JS)
│   ├── Dockerfile        ← NGINX container
│   └── nginx.conf        ← Reverse proxy config (/api → backend)
├── backend/
│   ├── server.js         ← Express API with architecture logic
│   ├── package.json
│   └── Dockerfile        ← Node.js 20 Alpine
├── k8s/
│   ├── deployment.yaml   ← Frontend + Backend Deployments
│   ├── service.yaml      ← ClusterIP Services (L4)
│   ├── ingress.yaml      ← NGINX Ingress (L7)
│   └── hpa.yaml          ← HPA for both tiers
└── argocd/
    └── application.yaml  ← ArgoCD GitOps app definition
```

---

## 1. Local development

```bash
# Backend
cd backend
npm install
node server.js            # runs on :3000

# Frontend
cd frontend
# open index.html in browser (change API base to http://localhost:3000)
```

---

## 2. Build Docker images

```bash
# From project root
docker build -t yourdockerhub/arch-builder-frontend:latest ./frontend
docker build -t yourdockerhub/arch-builder-backend:latest  ./backend

# Verify
docker images | grep arch-builder
```

---

## 3. Test locally with Docker Compose

```bash
# Create docker-compose.yml in project root:
cat > docker-compose.yml <<'EOF'
version: '3.8'
services:
  backend:
    image: yourdockerhub/arch-builder-backend:latest
    ports: ["3000:3000"]
    environment:
      NODE_ENV: production

  frontend:
    image: yourdockerhub/arch-builder-frontend:latest
    ports: ["8080:80"]
    depends_on: [backend]
EOF

docker compose up -d
open http://localhost:8080
```

---

## 4. Push to DockerHub

```bash
docker login

docker push yourdockerhub/arch-builder-frontend:latest
docker push yourdockerhub/arch-builder-backend:latest
```

---

## 5. Deploy to Kubernetes

```bash
# Create namespace
kubectl create namespace production

# Apply all manifests
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml

# Verify
kubectl get pods -n production
kubectl get svc  -n production
kubectl get ingress -n production
kubectl get hpa  -n production
```

---

## 6. Configure Ingress

```bash
# Install NGINX Ingress Controller (if not installed)
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace

# Install cert-manager for TLS (optional)
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set installCRDs=true

# Get external IP
kubectl get svc -n ingress-nginx ingress-nginx-controller

# Point your DNS → that IP, then update ingress.yaml host field
```

---

## 7. ArgoCD GitOps integration

```bash
# Install ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd -f \
  https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Access ArgoCD UI
kubectl port-forward svc/argocd-server -n argocd 8080:443

# Get initial admin password
kubectl get secret argocd-initial-admin-secret -n argocd \
  -o jsonpath="{.data.password}" | base64 -d

# Add your Git repo
argocd repo add https://github.com/yourusername/arch-builder.git \
  --username <user> --password <token>

# Create the application from manifest
kubectl apply -f argocd/application.yaml

# Or via CLI
argocd app create arch-builder \
  --repo https://github.com/yourusername/arch-builder.git \
  --path k8s \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace production \
  --sync-policy automated \
  --self-heal \
  --auto-prune
```

After this, every `git push` to the `k8s/` folder auto-deploys.

---

## Architecture decision notes

### Load balancing: L4 vs L7

| Layer | Component | What it does |
|-------|-----------|-------------|
| L4 | Kubernetes Service (ClusterIP) | TCP round-robin. No request inspection. Used for pod-to-pod routing |
| L7 | NGINX Ingress Controller | HTTP-aware: path routing (/api → backend, / → frontend), SSL termination, host-based routing |

### Kubernetes vs VM — when to choose

| Scale | Recommendation | Reason |
|-------|---------------|--------|
| < 1K users | Docker Compose / single VM | Simpler ops, lower overhead |
| 1K–10K | Kubernetes (managed) | HPA starts paying off; rolling deploys needed |
| > 10K | Kubernetes + HPA + PDB | Essential for zero-downtime scaling |

### Scaling calculation

```
pods_needed = ceil(peak_rps / throughput_per_pod)
throughput_per_pod ≈ 50 req/s (Node.js, CPU-bound) or 200 req/s (static NGINX)
nodes_needed = ceil((pods * cpu_req) / node_cpu_allocatable)
```

HPA fires at CPU > 70% to avoid hitting limits before scale-out completes
(scale-out latency is ~30–60s including image pull).

---

## Environment variables (backend)

| Var | Default | Description |
|-----|---------|-------------|
| PORT | 3000 | API listen port |
| NODE_ENV | production | Express env mode |

---

*Replace `yourdockerhub` and `yourdomain.com` throughout before deploying.*