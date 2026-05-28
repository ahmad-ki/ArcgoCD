const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// ─── Architecture computation logic ───────────────────────────────────────────

function computeArchitecture(input) {
  const { users, appType, appTier, workloads, cloud } = input;

  // Scale tier: 0=100, 1=1K, 2=10K, 3=100K, 4=1M
  const scale = ['100','1K','10K','100K','1M'].indexOf(users);

  // ── Architecture layers ──────────────────────────────────────────────────────
  const needsQueue = workloads.includes('File uploads (PDF/images)') ||
                     workloads.includes('Write-heavy') || scale >= 3;
  const needsCDN   = appTier === 'Static website' || scale >= 2;
  const isReadHeavy = workloads.includes('Read-heavy');
  const isRealtime  = workloads.includes('Real-time APIs');

  const dbType = ['CRM','SaaS platform'].includes(appType) ? 'PostgreSQL (relational)'
    : appType === 'Search system' ? 'Elasticsearch + PostgreSQL'
    : appType === 'Document processing' ? 'MongoDB (document store)'
    : 'PostgreSQL (relational)';

  const arch = {
    frontend: appTier === 'Static website' ? 'Static HTML/JS (S3/Blob + CDN)'
      : appTier === 'API-based system' ? 'No frontend — REST/GraphQL API only'
      : 'React SPA (NGINX container)',
    backend: isRealtime
      ? 'Node.js (Express + WebSocket / Socket.io)'
      : 'Node.js Express REST API',
    database: dbType,
    cache: isReadHeavy || scale >= 2 ? 'Redis (read-through cache, TTL-based)' : 'None required at this scale',
    queue: needsQueue ? 'RabbitMQ / Azure Service Bus (async job processing)' : null,
    cdn: needsCDN ? 'Cloudflare CDN / Azure Front Door' : null,
  };

  // ── Infrastructure sizing ────────────────────────────────────────────────────
  const podMap = [
    { fe: 1, be: 1, nodes: 1, nodeType: 'Standard_B2s / t3.small', storage: 20 },
    { fe: 1, be: 2, nodes: 2, nodeType: 'Standard_B4ms / t3.medium', storage: 50 },
    { fe: 2, be: 3, nodes: 3, nodeType: 'Standard_D4s_v3 / m5.xlarge', storage: 100 },
    { fe: 3, be: 5, nodes: 5, nodeType: 'Standard_D8s_v3 / m5.2xlarge', storage: 500 },
    { fe: 5, be: 10, nodes: 10, nodeType: 'Standard_D16s_v3 / m5.4xlarge', storage: 2000 },
  ];
  const p = podMap[Math.max(0, Math.min(scale, 4))];

  const sizing = {
    frontend_pods: p.fe,
    backend_pods:  p.be,
    node_count:    p.nodes,
    node_type:     p.nodeType,
    cpu_per_pod:   scale <= 1 ? '250m' : scale <= 3 ? '500m' : '1000m',
    memory_per_pod: scale <= 1 ? '256Mi' : scale <= 3 ? '512Mi' : '1Gi',
    hpa_min: p.be,
    hpa_max: p.be * 3,
    hpa_trigger: 'CPU > 70% OR Memory > 80%',
    storage_gb: p.storage,
  };

  // ── Cloud recommendation ─────────────────────────────────────────────────────
  const useK8s = scale >= 2;

  const cloudMap = {
    Azure: {
      provider: 'Azure (AKS)',
      service_compute: scale >= 2 ? 'AKS (Azure Kubernetes Service)' : 'Azure Container Instances',
      service_db: appType === 'Search system' ? 'Azure Cognitive Search + Azure Database for PostgreSQL'
        : appType === 'Document processing' ? 'Azure Cosmos DB (MongoDB API)'
        : 'Azure Database for PostgreSQL Flexible Server',
      service_cache: 'Azure Cache for Redis',
      service_lb: 'Azure Application Gateway (L7) + Azure Load Balancer (L4)',
      justification: `Azure AKS is recommended for ${appType} at this scale. Managed Kubernetes removes ops overhead while providing auto-scaling, rolling deploys, and built-in monitoring via Azure Monitor.`,
    },
    AWS: {
      provider: 'AWS (EKS)',
      service_compute: scale >= 2 ? 'EKS (Elastic Kubernetes Service)' : 'ECS Fargate',
      service_db: appType === 'Document processing' ? 'DynamoDB + RDS PostgreSQL'
        : appType === 'Search system' ? 'OpenSearch Service + RDS'
        : 'RDS PostgreSQL (Multi-AZ)',
      service_cache: 'ElastiCache (Redis)',
      service_lb: 'ALB (L7) + NLB (L4)',
      justification: `AWS EKS offers the most mature Kubernetes ecosystem. ALB Ingress Controller provides L7 routing with path/host-based rules ideal for ${appType}.`,
    },
    GCP: {
      provider: 'GCP (GKE)',
      service_compute: 'GKE Autopilot (serverless K8s)',
      service_db: 'Cloud SQL (PostgreSQL) + Firestore',
      service_cache: 'Memorystore (Redis)',
      service_lb: 'Cloud Load Balancing (global anycast)',
      justification: `GKE Autopilot removes node management entirely — ideal for teams focused on app delivery. Global anycast load balancing minimises latency worldwide.`,
    },
    'On-premise / Local': {
      provider: 'On-premise (k3s / kubeadm)',
      service_compute: scale >= 2 ? 'k3s / kubeadm cluster' : 'Docker Compose / single VM',
      service_db: 'Self-hosted PostgreSQL (primary + replica)',
      service_cache: 'Self-hosted Redis Sentinel',
      service_lb: 'MetalLB + NGINX Ingress Controller',
      justification: `On-premise is suitable for data-sovereign workloads or cost-sensitive small deployments. At ${users} users, a ${p.nodes}-node k3s cluster with MetalLB handles the load.`,
    },
  };

  const selectedCloud = cloud === 'Best recommendation (auto)' || cloud === 'Best fit (auto)'
    ? (scale >= 3 ? 'Azure' : 'AWS')
    : cloud;

  const cloudResult = cloudMap[selectedCloud] || cloudMap['Azure'];
  cloudResult.use_kubernetes = useK8s;
  cloudResult.k8s_justification = useK8s
    ? `At ${users} users, Kubernetes provides HPA auto-scaling, zero-downtime rolling updates, and self-healing — worth the operational overhead.`
    : `At ${users} users, a single VM or Docker Compose deployment is simpler and more cost-effective. Migrate to K8s when you hit ~10K users.`;

  // ── Cost estimation ──────────────────────────────────────────────────────────
  const costMap = [
    { compute: 30,  db: 25,  storage: 5,  lb: 10 },
    { compute: 80,  db: 50,  storage: 10, lb: 15 },
    { compute: 300, db: 120, storage: 30, lb: 25 },
    { compute: 800, db: 300, storage: 80, lb: 50 },
    { compute: 3000, db: 1000, storage: 400, lb: 200 },
  ];
  const c = costMap[Math.max(0, Math.min(scale, 4))];
  const cost = {
    compute: c.compute, database: c.db, storage: c.storage, loadbalancer: c.lb,
    small_monthly: costMap[0].compute + costMap[0].db + costMap[0].storage + costMap[0].lb,
    medium_monthly: costMap[2].compute + costMap[2].db + costMap[2].storage + costMap[2].lb,
    large_monthly: costMap[4].compute + costMap[4].db + costMap[4].storage + costMap[4].lb,
    currency: 'USD',
  };

  // ── Kubernetes params ────────────────────────────────────────────────────────
  const appSlug = appType.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const k8s = {
    app_name: appSlug,
    namespace: 'default',
    frontend_image: `yourdockerhub/${appSlug}-frontend:latest`,
    backend_image:  `yourdockerhub/${appSlug}-backend:latest`,
    frontend_replicas: sizing.frontend_pods,
    backend_replicas:  sizing.backend_pods,
    frontend_cpu_req: '200m', frontend_cpu_lim: sizing.cpu_per_pod,
    frontend_mem_req: '256Mi', frontend_mem_lim: sizing.memory_per_pod,
    backend_cpu_req: sizing.cpu_per_pod, backend_cpu_lim: scale >= 3 ? '2000m' : '1000m',
    backend_mem_req: sizing.memory_per_pod,
    backend_mem_lim: scale >= 3 ? '2Gi' : '1Gi',
    ingress_host: `${appSlug}.yourdomain.com`,
    hpa_min: sizing.hpa_min,
    hpa_max: sizing.hpa_max,
    hpa_cpu_threshold: 70,
  };

  // ── ASCII diagram ────────────────────────────────────────────────────────────
  const diagram = [
    '         Internet',
    '             │',
    needsCDN ? '             ▼\n      [CDN / WAF Layer]\n             │' : '',
    '             ▼',
    '  [NGINX Ingress Controller]   ← L7 (host/path routing)',
    '         │           │',
    '         ▼           ▼',
    ` [Frontend ×${sizing.frontend_pods}]  [Backend ×${sizing.backend_pods}]`,
    '                      │',
    '         ┌────────────┼────────────┐',
    isReadHeavy||scale>=2 ? '         ▼            ▼            ▼\n   [Redis Cache]  [Database]  ' + (needsQueue ? '[Message Queue]' : '') : '         ▼\n      [Database]',
    '',
    '  ── Database ──────────────────────────────',
    `  ${arch.database}`,
    scale >= 2 ? '  Primary ──► Replica(s)  [R/W split]' : '  Single instance',
    needsQueue ? '\n  ── Queue ───────────────────────────────\n  Workers consume jobs asynchronously' : '',
  ].filter(Boolean).join('\n');

  return { arch, sizing, cloud: cloudResult, cost, k8s, diagram };
}

// ─── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/architecture', (req, res) => {
  try {
    const result = computeArchitecture(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Architecture API running on :${PORT}`));