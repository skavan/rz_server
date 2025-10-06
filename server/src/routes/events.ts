import { Router } from 'express';
import { eventBus } from '../utils/event-bus.js';
import { getRequestScope } from '../utils/scope.js';
import { getPgListenerStatus, forceRelisten } from '../realtime/pg-listener.js';

const router = Router();

// GET /api/events/stream?resources=products,inventory_items
router.get('/stream', async (req, res) => {
  // Setup SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // Disable proxy buffering if behind Nginx
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Heartbeat to keep connections alive on some proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 25000);

  const resources = typeof req.query.resources === 'string'
    ? (req.query.resources as string).split(',').map(s => s.trim()).filter(Boolean)
    : undefined;

  // Resolve server-side scope (authoritative)
  let scope = await getRequestScope(req as any);

  // In development, allow optional query overrides for scope since EventSource cannot set headers
  if (process.env.NODE_ENV !== 'production') {
    const qCustomer = typeof req.query.customerId === 'string' ? parseInt(String(req.query.customerId), 10) : undefined;
    const qHomes = typeof req.query.homeIds === 'string'
      ? String(req.query.homeIds)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((n) => parseInt(n, 10))
          .filter((n) => !Number.isNaN(n))
      : undefined;
    if ((qCustomer && Number.isFinite(qCustomer)) || (qHomes && qHomes.length)) {
      scope = {
        customerId: qCustomer && Number.isFinite(qCustomer) ? qCustomer : scope.customerId,
        homeIds: qHomes && qHomes.length ? qHomes : scope.homeIds,
      };
    }
  }
  const unsubscribe = eventBus.subscribe(res, resources, { customerId: scope.customerId, homeIds: scope.homeIds });

  // Debug: log connection and liveness heartbeats
  const subCount = eventBus.getSubscriberCount();
  if (process.env.NODE_ENV !== 'production') {
    console.log(`🔗 SSE client connected (${subCount} total)`, { resources: resources ?? '*', scope });
  }

  // Periodic heartbeat event every 60s so clients can show alive indicator
  const alive = setInterval(() => {
    try {
      const ts = Date.now();
      res.write(`event: heartbeat\nid: ${ts}\ndata: ${JSON.stringify({ timestamp: ts })}\n\n`);
      if (process.env.NODE_ENV !== 'production') {
        console.log('💓 SSE heartbeat sent');
      }
    } catch {
      clearInterval(alive);
    }
  }, 60000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(alive);
    unsubscribe();
    const leftCount = eventBus.getSubscriberCount();
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔌 SSE client disconnected (${leftCount} remaining)`);
    }
  });

  // Initial hello
  res.write(`retry: 5000\n`);
  res.write(`event: hello\ndata: ${JSON.stringify({ timestamp: Date.now(), resources: resources ?? '*', scope: { customerId: scope.customerId, homeIds: scope.homeIds } })}\n\n`);
});

// GET /api/events/health - runtime health of realtime system
router.get('/health', (req, res) => {
  const listener = getPgListenerStatus();
  res.json({
    sseSubscribers: eventBus.getSubscriberCount(),
    pgListener: listener,
    timestamp: Date.now(),
  });
});

// POST /api/events/dev/relisten - dev-only reissue LISTEN
router.post('/dev/relisten', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not allowed in production' });
  }
  try {
    const result = await forceRelisten();
    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// POST /api/events/dev/push  (dev only) { event, data }
router.post('/dev/push', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not allowed in production' });
  }
  const { event, data } = req.body || {};
  if (!event) return res.status(400).json({ error: 'Missing event' });
  eventBus.broadcast({ event, data, meta: { timestamp: Date.now(), source: 'dev' } });
  res.json({ ok: true });
});

export default router;
