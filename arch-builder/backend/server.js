const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// ═══════════════════════════════════════════════════════════════════════════════
// V2 — Smart Architecture Advisor
// Extends V1 with: SLA, budget, traffic pattern, latency, data size,
// consistency, auth, region, architecture style + Mermaid diagram + advisories
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Helper: clamp ─────────────────────────────────────────────────────────────
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// ─── Rule engine ───────────────────────────────────────────────────────────────
function applyV2Rules(input) {
  const {
    sla = '99%',
    budget = 'medium',
    trafficPattern = 'constant',
    latency = 'normal',
    dataSize = 'medium',
    consistency = 'SQL',
    auth = 'basic',
    region = 'local',
    architecture = 'monolith',
  } = input;

  const flags = {
    multiZone:       sla === '99.9%' || sla === '99.99%',
    activeActive:    sla === '99.99%',
    needsHPA:        trafficPattern === 'peak' || trafficPattern === 'burst',
    needsCDN:        latency === 'low' || latency === 'realtime' || region === 'global',
    needsCache:      latency === 'low' || latency === 'realtime' || dataSize !== 'small',
    needsQueue:      architecture === 'microservices' || trafficPattern === 'burst',
    needsKafka:      architecture === 'microservices' && dataSize === 'large',
    distributedDB:   dataSize === 'large',
    noSQLdb:         consistency === 'NoSQL' || dataSize === 'large',
    needsSSO:        auth === 'SSO',
    multiRegion:     region === 'global',
    useK8s:          architecture === 'microservices' || budget !== 'low',
    podBoost:        trafficPattern === 'burst' ? 2 : trafficPattern === 'peak' ? 1.5 : 1,
    slaMultiplier:   sla === '99.99%' ? 2 : sla === '99.9%' ? 1.5 : 1,
    costMultiplier:  budget === 'high' ? 1.5 : budget === 'low' ? 0.6 : 1.0,
  };

  return flags;
}

// ─── Recommendations engine ────────────────────────────────────────────────────
function buildRecommendations(input, flags, scale) {
  const recs = [];

  if (flags.multiZone)
    recs.push({ level: 'critical', text: `SLA ${input.sla} requires multi-AZ deployment — single-zone outage must not breach SLA.` });

  if (flags.activeActive)
    recs.push({ level: 'critical', text: '99.99% SLA requires active-active multi-region with automated failover < 30s.' });

  if (flags.needsHPA)
    recs.push({ level: 'warning', text: `${input.trafficPattern} traffic detected — configure HPA with scale-up buffer. Pre-warm pods before predicted spikes.` });

  if (flags.needsKafka)
    recs.push({ level: 'info', text: 'Microservices + large data → use Kafka (high throughput) over RabbitMQ (task queues).' });
  else if (flags.needsQueue)
    recs.push({ level: 'info', text: 'Async queue recommended — decouples services and absorbs traffic bursts gracefully.' });

  if (flags.needsCDN)
    recs.push({ level: 'info', text: `${input.latency} latency requirement → CDN edge caching is non-negotiable. Target < 50ms TTFB.` });

  if (flags.distributedDB)
    recs.push({ level: 'warning', text: 'Large data tier — plan sharding strategy from day one. Retrofit is painful at scale.' });

  if (flags.multiRegion)
    recs.push({ level: 'critical', text: 'Global region — deploy to ≥ 2 geographic regions. Use latency-based DNS routing (Route53 / Traffic Manager).' });

  if (flags.needsSSO)
    recs.push({ level: 'info', text: 'SSO selected — integrate OIDC/SAML provider (Azure AD, Okta, Auth0). Use short-lived JWTs (15 min) + refresh tokens.' });

  if (input.architecture === 'microservices' && scale <= 1)
    recs.push({ level: 'warning', text: 'Microservices at small scale adds ops overhead without benefit. Consider a modular monolith until you hit 10K+ users.' });

  if (input.budget === 'low' && flags.multiZone)
    recs.push({ level: 'warning', text: 'Low budget + high SLA is a tension — multi-zone increases cost ~40%. Consider SLA trade-off.' });

  if (input.trafficPattern === 'realtime' || input.latency === 'realtime')
    recs.push({ level: 'info', text: 'Real-time latency → use WebSockets or SSE. Avoid polling. Place nodes in region closest to users.' });

  if (scale >= 4)
    recs.push({ level: 'critical', text: '1M+ users — load test to 3× peak before go-live. Database connection pooling (PgBouncer) is mandatory.' });

  return recs;
}

// ─── Database selection ────────────────────────────────────────────────────────
function selectDatabase(appType, flags, cloud) {
  if (flags.noSQLdb) {
    if (appType === 'Search system') return cloud.includes('Azure')
      ? 'Azure Cognitive Search + Cosmos DB' : 'Elasticsearch + MongoDB';
    if (appType === 'Document processing') return cloud.includes('Azure')
      ? 'Azure Cosmos DB (Mongo API)' : 'MongoDB Atlas';
    return flags.distributedDB
      ? 'MongoDB (sharded) + Redis read replicas'
      : 'MongoDB (document store)';
  }
  // SQL path
  if (appType === 'Search system') return 'PostgreSQL + Elasticsearch (full-text)';
  if (['CRM','SaaS platform'].includes(appType)) return flags.multiZone
    ? 'PostgreSQL (Multi-AZ primary + read replicas)' : 'PostgreSQL';
  return flags.multiZone
    ? 'PostgreSQL (Multi-AZ, streaming replication)' : 'PostgreSQL';
}

// ─── Mermaid diagram ───────────────────────────────────────────────────────────
function buildMermaid(arch, sizing, flags, input) {
  const fe = sizing.frontend_pods;
  const be = sizing.backend_pods;
  const lines = ['graph TD'];

  lines.push('  User([👤 User])');

  if (flags.multiRegion)
    lines.push('  User --> DNS[🌍 Global DNS / GeoDNS]');
  else
    lines.push('  User --> Ingress');

  if (flags.needsCDN)
    lines.push('  DNS --> CDN[☁️ CDN / WAF Edge]');

  if (flags.multiRegion)
    lines.push('  CDN --> Ingress[⚖️ NGINX Ingress L7]');
  else if (flags.needsCDN)
    lines.push('  CDN --> Ingress[⚖️ NGINX Ingress L7]');

  lines.push(`  Ingress --> FE["🖥 Frontend ×${fe}"]`);
  lines.push(`  Ingress --> BE["⚙️ Backend ×${be}"]`);

  if (flags.needsSSO)
    lines.push('  BE --> Auth[🔐 SSO / OIDC Provider]');

  if (flags.needsCache)
    lines.push('  BE --> Cache[⚡ Redis Cache]');

  lines.push('  BE --> DB[(🗄️ Database)]');

  if (flags.needsKafka)
    lines.push('  BE --> Queue[📨 Kafka Cluster]');
  else if (flags.needsQueue)
    lines.push('  BE --> Queue[📨 RabbitMQ / Service Bus]');

  if (flags.needsQueue)
    lines.push('  Queue --> Workers["🔧 Workers ×' + Math.max(2, Math.ceil(be/2)) + '"]');

  if (flags.multiZone) {
    lines.push('  DB --> DBR[(🗄️ DB Replica Zone-B)]');
    lines.push('  style DBR fill:#1a2d4d');
  }

  if (flags.multiRegion) {
    lines.push('  DB --> DBGeo[(🌍 DB Geo-Replica)]');
    lines.push('  style DBGeo fill:#0f2d20');
  }

  // Style nodes
  lines.push('  style User fill:#1a1d27,stroke:#5b8dee,color:#e8eaf0');
  lines.push('  style Ingress fill:#1a2d4d,stroke:#5b8dee,color:#e8eaf0');
  lines.push('  style FE fill:#0f2d20,stroke:#36c98e,color:#e8eaf0');
  lines.push('  style BE fill:#2d1a0f,stroke:#f0a050,color:#e8eaf0');
  lines.push('  style DB fill:#2d1a2d,stroke:#c080e0,color:#e8eaf0');

  if (flags.needsCDN)
    lines.push('  style CDN fill:#1a2d4d,stroke:#5b8dee,color:#e8eaf0');
  if (flags.needsCache)
    lines.push('  style Cache fill:#2d2a0f,stroke:#e8c030,color:#e8eaf0');
  if (flags.needsQueue)
    lines.push('  style Queue fill:#2d1a1a,stroke:#e05555,color:#e8eaf0');

  return lines.join('\n');
}

// ─── Main compute function (V2) ────────────────────────────────────────────────
function computeArchitectureV2(input) {
  // ── V1 base fields ──
  let { users = '10K', appType = 'E-commerce', appTier = 'Dynamic application',
      workloads = [], cloud = 'Azure' } = input;


// ✅ FIX: normalize cloud value (THIS FIXES YOUR BUG)
if (!cloud) cloud = 'Azure';

const c = cloud.toString().toLowerCase().trim();

if (c.includes('aws')) cloud = 'AWS';
else if (c.includes('gcp')) cloud = 'GCP';
else if (c.includes('on')) cloud = 'On-premise / Local';
else if (c.includes('auto')) cloud = 'Best fit (auto)';
else cloud = 'Azure';


  const scale = clamp(['100','1K','10K','100K','1M'].indexOf(users), 0, 4);
  const flags = applyV2Rules(input);

  // ── Architecture layers ──────────────────────────────────────────────────────
  const isRealtime = workloads.includes('Real-time APIs') || input.latency === 'realtime';
  const isReadHeavy = workloads.includes('Read-heavy');
  const needsQueue = flags.needsQueue || workloads.includes('File uploads (PDF/images)') || workloads.includes('Write-heavy');
  const needsCDN = flags.needsCDN || appTier === 'Static website' || scale >= 2;

  let selectedCloud;

if (cloud === 'Best fit (auto)' || cloud === 'Best recommendation (auto)') {
  if (input.region === 'global') {
    selectedCloud = 'AWS';
  } else if (scale >= 3) {
    selectedCloud = 'Azure';
  } else {
    selectedCloud = 'AWS';
  }
} else {
  selectedCloud = cloud;
}
console.log("Incoming cloud:", input.cloud);
console.log("Normalized cloud:", cloud);
console.log("Selected cloud:", selectedCloud);
  const arch = {
    frontend: appTier === 'Static website'
      ? 'Static HTML/JS (Object Storage + CDN)'
      : appTier === 'API-based system'
      ? 'No frontend — REST/GraphQL API only'
      : 'React SPA (NGINX container)',
    backend: isRealtime
      ? 'Node.js (Express + WebSocket / Socket.io)'
      : input.architecture === 'microservices'
      ? 'Node.js microservices (Express per domain)'
      : 'Node.js Express REST API',
    database: selectDatabase(appType, flags, selectedCloud),
    cache: (flags.needsCache || isReadHeavy || scale >= 2)
      ? 'Redis (read-through cache, TTL-based)'
      : null,
    queue: needsQueue
      ? (flags.needsKafka ? 'Kafka (high-throughput event streaming)' : 'RabbitMQ / Azure Service Bus')
      : null,
    cdn: needsCDN ? 'Cloudflare CDN / Azure Front Door' : null,
    auth: input.auth === 'SSO' ? 'OIDC/SAML SSO (Azure AD / Okta)' : input.auth === 'basic' ? 'JWT + Refresh Token' : 'None',
    multiZone: flags.multiZone ? (flags.activeActive ? 'Active-Active (2+ regions)' : 'Active-Passive (multi-AZ)') : 'Single zone',
  };

  // ── Sizing (V2: boost by traffic pattern + SLA multiplier) ──────────────────
  const basePods = [
    { fe: 1, be: 1, nodes: 1, nodeType: 'Standard_B2s / t3.small',       storage: 20 },
    { fe: 1, be: 2, nodes: 2, nodeType: 'Standard_B4ms / t3.medium',      storage: 50 },
    { fe: 2, be: 3, nodes: 3, nodeType: 'Standard_D4s_v3 / m5.xlarge',    storage: 100 },
    { fe: 3, be: 5, nodes: 5, nodeType: 'Standard_D8s_v3 / m5.2xlarge',   storage: 500 },
    { fe: 5, be: 10, nodes: 10, nodeType: 'Standard_D16s_v3 / m5.4xlarge', storage: 2000 },
  ][scale];

  const fePods  = Math.ceil(basePods.fe  * flags.podBoost * flags.slaMultiplier);
  const bePods  = Math.ceil(basePods.be  * flags.podBoost * flags.slaMultiplier);
  const nodes   = flags.multiZone
    ? Math.ceil(basePods.nodes * flags.slaMultiplier * (flags.activeActive ? 2 : 1.5))
    : basePods.nodes;

  const sizing = {
    frontend_pods:  fePods,
    backend_pods:   bePods,
    node_count:     nodes,
    node_type:      basePods.nodeType,
    cpu_per_pod:    scale <= 1 ? '250m' : scale <= 3 ? '500m' : '1000m',
    memory_per_pod: scale <= 1 ? '256Mi' : scale <= 3 ? '512Mi' : '1Gi',
    hpa_min:        bePods,
    hpa_max:        bePods * (input.trafficPattern === 'burst' ? 5 : 3),
    hpa_trigger:    'CPU > 70% OR Memory > 80%',
    storage_gb:     flags.distributedDB ? basePods.storage * 3 : basePods.storage,
    worker_pods:    needsQueue ? Math.max(2, Math.ceil(bePods / 2)) : 0,
  };

  // ── Cloud map ────────────────────────────────────────────────────────────────
  const cloudMap = {
    Azure: {
      provider: 'Azure (AKS)',
      service_compute: flags.useK8s || scale >= 2 ? 'AKS (Azure Kubernetes Service)' : 'Azure Container Instances',
      service_db: flags.noSQLdb
        ? (appType === 'Document processing' ? 'Azure Cosmos DB (MongoDB API)' : 'Azure Cosmos DB + PostgreSQL')
        : (flags.multiZone ? 'Azure Database for PostgreSQL – Flexible Server (HA)' : 'Azure Database for PostgreSQL'),
      service_cache: 'Azure Cache for Redis' + (flags.multiZone ? ' (geo-replication)' : ''),
      service_lb: 'Azure Application Gateway (L7) + Azure Load Balancer (L4)',
      service_storage: 'Azure Blob Storage',
      service_queue: flags.needsKafka ? 'Azure Event Hubs (Kafka API)' : 'Azure Service Bus',
      service_cdn: 'Azure Front Door + CDN',
      service_auth: 'Azure Active Directory (OIDC)',
      justification: `AKS on Azure suits ${appType} with ${input.sla} SLA. ${flags.multiZone ? 'Availability Zones enabled for HA. ' : ''}${flags.multiRegion ? 'Azure Traffic Manager for geo-routing. ' : ''}Azure Monitor + Log Analytics for full observability.`,
    },
    AWS: {
      provider: 'AWS (EKS)',
      service_compute: flags.useK8s || scale >= 2 ? 'EKS (Elastic Kubernetes Service)' : 'ECS Fargate',
      service_db: flags.noSQLdb
        ? 'DynamoDB (global tables)' + (flags.multiZone ? ' + Aurora PostgreSQL Multi-AZ' : '')
        : (flags.multiZone ? 'RDS Aurora PostgreSQL (Multi-AZ)' : 'RDS PostgreSQL'),
      service_cache: 'ElastiCache (Redis)' + (flags.multiRegion ? ' Global Datastore' : ''),
      service_lb: 'ALB (L7 path routing) + NLB (L4 TCP)',
      service_storage: 'S3',
      service_queue: flags.needsKafka ? 'Amazon MSK (Managed Kafka)' : 'Amazon SQS + SNS',
      service_cdn: 'CloudFront (global edge)',
      service_auth: 'AWS Cognito + IAM Identity Center',
      justification: `EKS on AWS offers the most mature K8s ecosystem. ${flags.multiZone ? 'Multi-AZ EKS node groups + Aurora Multi-AZ for ' + input.sla + ' SLA. ' : ''}ALB Ingress Controller handles L7 routing natively.`,
    },
    GCP: {
      provider: 'GCP (GKE)',
      service_compute: 'GKE Autopilot' + (flags.multiRegion ? ' (multi-region)' : ''),
      service_db: flags.noSQLdb ? 'Firestore + BigQuery' : (flags.multiZone ? 'Cloud SQL (HA) + Spanner' : 'Cloud SQL PostgreSQL'),
      service_cache: 'Memorystore (Redis)',
      service_lb: 'Cloud Load Balancing (global anycast L7)',
      service_storage: 'Cloud Storage',
      service_queue: flags.needsKafka ? 'Pub/Sub (Kafka-compatible)' : 'Cloud Pub/Sub',
      service_cdn: 'Cloud CDN + Media CDN',
      service_auth: 'Google Identity Platform',
      justification: `GKE Autopilot removes node management. ${flags.multiRegion ? 'Cloud Spanner for globally-consistent SQL at scale. ' : ''}Global anycast LB ensures lowest latency worldwide.`,
    },
    'On-premise / Local': {
      provider: 'On-premise (k3s / kubeadm)',
      service_compute: flags.useK8s || scale >= 2 ? 'k3s / kubeadm cluster' : 'Docker Compose',
      service_db: flags.noSQLdb ? 'MongoDB ReplicaSet' : 'PostgreSQL (primary + replica)',
      service_cache: 'Redis Sentinel',
      service_lb: 'MetalLB + NGINX Ingress',
      service_storage: 'MinIO (S3-compatible)',
      service_queue: flags.needsKafka ? 'Self-hosted Kafka (KRaft mode)' : 'RabbitMQ cluster',
      service_cdn: 'Cloudflare (proxy mode)',
      service_auth: 'Keycloak (self-hosted OIDC)',
      justification: `On-premise suits data-sovereign or cost-sensitive deployments. ${flags.multiZone ? 'Deploy across 2 physical locations for HA. ' : ''}MetalLB enables LoadBalancer services on bare metal.`,
    },
  };

  const cloudResult = { ...(cloudMap[selectedCloud] || cloudMap['Azure']) };
  cloudResult.use_kubernetes = flags.useK8s || scale >= 2;
  cloudResult.multi_zone = flags.multiZone;
  cloudResult.multi_region = flags.multiRegion;

  // ── Cost estimation (V2: apply budget + SLA + region multipliers) ────────────
  const baseCost = [
    { compute: 30,   db: 25,   storage: 5,   lb: 10  },
    { compute: 80,   db: 50,   storage: 10,  lb: 15  },
    { compute: 300,  db: 120,  storage: 30,  lb: 25  },
    { compute: 800,  db: 300,  storage: 80,  lb: 50  },
    { compute: 3000, db: 1000, storage: 400, lb: 200 },
  ][scale];

  const slaCostMult   = flags.activeActive ? 2.5 : flags.multiZone ? 1.6 : 1;
  const regionMult    = flags.multiRegion ? 1.8 : 1;
  const budgetMult    = flags.costMultiplier;
  const queueCost     = needsQueue ? (flags.needsKafka ? 150 : 60) : 0;
  const authCost      = input.auth === 'SSO' ? 40 : 0;
  const cdnCost       = needsCDN ? 30 : 0;
  const totalMult     = slaCostMult * regionMult * budgetMult;

  const cost = {
    compute:      Math.round(baseCost.compute  * totalMult),
    database:     Math.round(baseCost.db       * totalMult),
    storage:      Math.round(baseCost.storage  * budgetMult),
    loadbalancer: Math.round(baseCost.lb       * (flags.multiRegion ? 2 : 1)),
    queue:        Math.round(queueCost         * budgetMult),
    auth:         authCost,
    cdn:          cdnCost,
    currency: 'USD',
  };
  cost.total = cost.compute + cost.database + cost.storage + cost.loadbalancer + cost.queue + cost.auth + cost.cdn;
  cost.small_monthly  = 70;
  cost.medium_monthly = 475;
  cost.large_monthly  = 4600;

  // ── K8s params ───────────────────────────────────────────────────────────────
  const appSlug = appType.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const k8s = {
    app_name:         appSlug,
    namespace:        'production',
    frontend_image:   `yourdockerhub/${appSlug}-frontend:latest`,
    backend_image:    `yourdockerhub/${appSlug}-backend:latest`,
    frontend_replicas: sizing.frontend_pods,
    backend_replicas:  sizing.backend_pods,
    frontend_cpu_req: '200m', frontend_cpu_lim: sizing.cpu_per_pod,
    frontend_mem_req: '256Mi', frontend_mem_lim: sizing.memory_per_pod,
    backend_cpu_req:  sizing.cpu_per_pod,
    backend_cpu_lim:  scale >= 3 ? '2000m' : '1000m',
    backend_mem_req:  sizing.memory_per_pod,
    backend_mem_lim:  scale >= 3 ? '2Gi' : '1Gi',
    ingress_host:     `${appSlug}.yourdomain.com`,
    hpa_min:          sizing.hpa_min,
    hpa_max:          sizing.hpa_max,
    hpa_cpu_threshold: 70,
  };

  // ── Recommendations ──────────────────────────────────────────────────────────
  const recommendations = buildRecommendations(input, flags, scale);

  // ── Mermaid diagram ──────────────────────────────────────────────────────────
  const diagram = buildMermaid(arch, sizing, flags, input);

  // ── Summary flags (for frontend badges) ─────────────────────────────────────
  const summary = {
    infra:       cloudResult.use_kubernetes ? 'Kubernetes' : 'VM / Compose',
    ha:          flags.activeActive ? 'Active-Active' : flags.multiZone ? 'Multi-AZ' : 'Single Zone',
    scaling:     flags.needsHPA ? 'HPA Autoscale' : 'Fixed replicas',
    queue:       flags.needsKafka ? 'Kafka' : needsQueue ? 'RabbitMQ' : 'None',
    sla_tier:    input.sla || '99%',
  };

  return { arch, sizing, cloud: cloudResult, cost, k8s, diagram, recommendations, summary };
}

// ─── Routes ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', version: '2.0' }));

// V2 endpoint
app.post('/api/architecture', (req, res) => {
  try {
    const result = computeArchitectureV2(req.body);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// V1 compat alias
app.post('/api/architecture/v1', (req, res) => {
  try {
    const result = computeArchitectureV2(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Architecture Advisor V2 running on :${PORT}`));
