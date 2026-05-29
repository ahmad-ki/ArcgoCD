const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// ─── Pro-Extended Architecture Engine ────────────────────────────────────────

function computeArchitecture(input) {
  const { 
    sla, budget, traffic, latency, dataSize, 
    consistency, auth, region, architecture, workload 
  } = input;

  // ── Baseline Enterprise Defaults ──
  let fePods = 3, bePods = 3;
  let minPods = 3, maxPods = 5;
  let nodes = 3;
  let computeCost = 250, dbCost = 150, storageCost = 50, lbCost = 80;
  
  let components = {
    waf: true,
    cdn: false,
    redis: false,
    queue: false,
    mlops: false,
    db: consistency === 'NoSQL' ? 'MongoDB Atlas / DynamoDB' : 'PostgreSQL (Multi-AZ)',
    multiZone: true,
    gitops: 'Argo CD',
    provisioning: 'Terraform & Ansible',
    monitoring: 'Prometheus, Grafana & Self-Healing Alerts'
  };

  let recommendations = [];

  // ── Apply Pro Rules ──
  if (parseFloat(sla) >= 99.99) {
    nodes += 3;
    computeCost += 200;
    recommendations.push("Extreme SLA (≥99.99%): Multi-region active-active failover mandated.");
  }

  if (traffic === 'burst') {
    minPods = 3; maxPods = 15;
    fePods = '3-15 (HPA + KEDA)';
    bePods = '3-15 (HPA + KEDA)';
    recommendations.push("Burst traffic: Event-driven autoscaling (KEDA) enabled.");
  }

  if (latency === 'low' || latency === 'realtime') {
    components.cdn = true;
    components.redis = true;
    lbCost += 70;
    recommendations.push("Low latency profile: Edge CDN and Redis Cluster injected.");
  }

  if (dataSize === 'large') {
    components.db = consistency === 'NoSQL' ? 'Cassandra / CosmosDB (Distributed)' : 'CockroachDB / Aurora';
    dbCost += 400;
    storageCost += 250;
    recommendations.push("Large data: Upgraded to globally distributed database tier.");
  }

  if (architecture === 'microservices') {
    components.queue = true;
    computeCost += 150;
    recommendations.push("Microservices: Event-driven message broker (Kafka) added.");
  }

  if (workload === 'ai_ml') {
    components.mlops = true;
    nodes += 2; // GPU nodes
    computeCost += 500;
    recommendations.push("AI/ML Workload: GPU node pools and MLOps pipeline (Kubeflow) provisioned.");
  }

  let cloudProvider = 'AWS / Azure';
  if (region === 'global') {
    nodes *= 2;
    computeCost *= 2;
    dbCost *= 2;
    cloudProvider = 'AWS / Azure (Global Footprint)';
  }

  // ── Format Output for Frontend ──
  const arch = {
    frontend: `React/Next.js (${components.cdn ? 'Edge CDN + ' : ''}WAF Ingress)`,
    backend: `Node.js / Go (${architecture === 'microservices' ? 'Microservices' : 'Monolith'})`,
    database: components.db,
    cache: components.redis ? 'Redis Cache Cluster' : null,
    queue: components.queue ? 'Kafka / RabbitMQ' : null,
    mlops: components.mlops ? 'MLOps Platform (Model Serving & Pipelines)' : null,
    ops: `${components.provisioning} + ${components.gitops} + ${components.monitoring}`
  };

  const sizing = {
    frontend_pods: fePods,
    backend_pods: bePods,
    node_count: nodes,
    node_type: components.mlops ? 'Standard_NC4as_T4_v3 / p3.2xlarge (GPU)' : 'Standard_D4s_v3 / m5.xlarge',
    cpu_per_pod: '500m',
    memory_per_pod: components.mlops ? '4Gi' : '512Mi',
    hpa_min: minPods,
    hpa_max: maxPods,
    hpa_trigger: 'CPU > 65% or Event Queue Depth',
    storage_gb: dataSize === 'large' ? 2000 : (dataSize === 'medium' ? 500 : 100)
  };

  const cloudResult = {
    provider: cloudProvider,
    use_kubernetes: true,
    service_compute: 'Managed Kubernetes (AKS / EKS)',
    service_db: 'Managed Distributed Database',
    justifyinter: recommendations.join(' ')
  };

  const cost = {
    compute: computeCost, database: dbCost, storage: storageCost, loadbalancer: lbCost,
  };

  const k8s = {
    app_name: 'pro-app',
    namespace: 'default',
    gitops_tool: components.gitops,
    backend_image: 'registry.enterprise.com/backend:latest',
    hpa_min: minPods,
    hpa_max: maxPods,
    cpu_lim: components.mlops ? '2000m' : '1000m',
    mem_lim: components.mlops ? '4Gi' : '1Gi'
  };

  // ── Advanced Enterprise Diagram Generation (Zoned) ──
  let diagram = `graph TD
  classDef k8s fill:#326ce5,stroke:#fff,stroke-width:2px,color:#fff;
  classDef db fill:#336791,stroke:#fff,stroke-width:2px,color:#fff;
  classDef cache fill:#dc382d,stroke:#fff,stroke-width:2px,color:#fff;
  classDef queue fill:#ff6600,stroke:#fff,stroke-width:2px,color:#fff;
  classDef sec fill:#4caf50,stroke:#fff,stroke-width:2px,color:#fff;
  classDef ai fill:#9c27b0,stroke:#fff,stroke-width:2px,color:#fff;

  User((User))
  
  subgraph Public Zone
    WAF[Web Application Firewall]:::sec
    ${components.cdn ? 'CDN[Edge CDN]' : ''}
    Ingress[K8s NGINX/ALB Ingress Controller]:::k8s
  end

  subgraph Private Zone [Platform Compute - AKS/EKS]
    Frontend[Frontend Pods: ${fePods}]:::k8s
    Backend[Backend API Pods: ${bePods}]:::k8s
    ${components.queue ? 'Queue{{Kafka Event Stream}}:::queue\n    Workers[Async Workers]:::k8s' : ''}
    ${components.mlops ? 'MLOps[Model Inference Pods]:::ai' : ''}
  end

  subgraph Data Zone
    DB[(${components.db})]:::db
    ${components.redis ? 'Redis[(Redis Cache)]:::cache' : ''}
  end

  User --> WAF
  ${components.cdn ? 'WAF --> CDN\n  CDN --> Ingress' : 'WAF --> Ingress'}
  
  Ingress --> Frontend
  Frontend --> Backend
  
  ${components.redis ? 'Backend -.-> Redis' : ''}
  
  ${components.queue ? 'Backend --> Queue\n  Queue --> Workers\n  Workers --> DB' : 'Backend --> DB'}
  
  ${components.mlops ? 'Backend --> MLOps\n  MLOps --> DB' : ''}
  
  ${auth === 'SSO' ? 'Backend -.-> IdP[Enterprise IdP / Azure AD]' : ''}
`;

  return { arch, sizing, cloud: cloudResult, cost, k8s, diagram };
}

// ─── Routes ────────────────────────────────────────────────────────────────────

app.post('/api/architecture', (req, res) => {
  try {
    const result = computeArchitecture(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fixed buildArgoCdYaml to provide full schema-compliant Kubernetes deployment spec selectors
function buildArgoCdYaml(k) {
  return `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: ${k.app_name}-platform
  namespace: argocd
spec:
  project: default
  source:
    repoURL: 'https://github.com/enterprise/platform-manifests.git'
    path: kustomize/${k.app_name}/overlays/production
    targetRevision: HEAD
  destination:
    server: 'https://kubernetes.default.svc'
    namespace: ${k.namespace}
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: arch-builder-backend
  namespace: ${k.namespace}
spec:
  replicas: ${k.hpa_min}
  selector:
    matchLabels:
      app: arch-builder-backend
  template:
    metadata:
      labels:
        app: arch-builder-backend
    spec:
      containers:
      - name: api
        image: ${k.backend_image}
        ports:
        - containerPort: 3000
        resources:
          limits:
            cpu: "${k.cpu_lim}"
            memory: "${k.mem_lim}"
`;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Pro Architecture API running on :${PORT}`));