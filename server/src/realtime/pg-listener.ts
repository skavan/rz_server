import { pool } from '../db/index.js';
import { eventBus } from '../utils/event-bus.js';

let listenerClient: import('pg').PoolClient | null = null;
let reconnecting = false;
let reconnectAttempts = 0;
let lastNotificationAt = Date.now();
let healthTimer: NodeJS.Timeout | null = null;
let relistenCount = 0;

async function attachHandlers(client: import('pg').PoolClient) {
  client.on('error', (err) => {
    console.error('PG listener error:', err);
    scheduleReconnect();
  });

  client.on('notification', (msg) => {
    if (msg.channel !== 'data_change' || !msg.payload) return;
    lastNotificationAt = Date.now();
    try {
      const evt = JSON.parse(msg.payload);
      const resource = String(evt.resource);
      const type = String(evt.type);
      const id = evt.id;
      const homeId = (evt as any).homeId as number | null;
      const customerId = (evt as any).customerId as number | null;

      console.log(`🔔 PG NOTIFY data_change:`, { resource, type, id, homeId, customerId });

      eventBus.broadcast({
        event: `data_change:${resource}`,
        data: { type, resource, resourceId: id, data: null },
        meta: { timestamp: Date.now(), source: 'pg', audience: { customerId: customerId ?? undefined, homeIds: homeId ? [homeId] : [] } },
      });
    } catch (e) {
      console.error('Failed to parse data_change payload:', e, msg.payload);
    }
  });
}

function startHealthCheck() {
  if (healthTimer) return;
  // Periodic NOOP to detect stale connections and log health
  healthTimer = setInterval(async () => {
    try {
      // If no events for a long while, ping the DB to confirm connection is alive
      const idleMs = Date.now() - lastNotificationAt;
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🩺 PG listener heartbeat (idle ${Math.round(idleMs/1000)}s)`);
      }
      // Always ping the LISTEN client to detect dead connections
      if (!listenerClient) throw new Error('No listener client');
      await listenerClient.query('SELECT 1');
      // If we've been idle for a long time, re-issue LISTEN to self-heal
      if (idleMs > 10 * 60 * 1000) { // 10 minutes
        try {
          await listenerClient.query('UNLISTEN data_change');
          await listenerClient.query('LISTEN data_change');
          relistenCount++;
          console.warn(`🔁 Re-issued LISTEN data_change after prolonged idle (${Math.round(idleMs/1000)}s). relistenCount=${relistenCount}`);
        } catch (e) {
          console.warn('Failed to re-LISTEN; scheduling reconnect');
          scheduleReconnect();
        }
      }
    } catch (e) {
      console.warn('PG listener health check failed; scheduling reconnect');
      scheduleReconnect();
    }
  }, 60000); // check every minute
}

function stopHealthCheck() {
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
}

function backoffDelay(attempt: number) {
  const base = 500; // ms
  const max = 10000; // 10s
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(max, base * Math.pow(2, Math.max(0, attempt - 1))) + jitter;
}

async function scheduleReconnect() {
  if (reconnecting) return;
  reconnecting = true;
  stopHealthCheck();
  if (listenerClient) {
    try { listenerClient.release(true); } catch {}
    listenerClient = null;
  }
  reconnectAttempts += 1;
  const delay = backoffDelay(reconnectAttempts);
  console.warn(`Reconnecting PG LISTEN in ${delay}ms (attempt ${reconnectAttempts})`);
  setTimeout(async () => {
    try {
      await startPgListener();
      reconnecting = false;
      reconnectAttempts = 0;
    } catch (e) {
      reconnecting = false;
      scheduleReconnect();
    }
  }, delay);
}

export async function startPgListener() {
  try {
    if (listenerClient) return listenerClient;
    const client = await pool.connect();
    listenerClient = client;
    await client.query('LISTEN data_change');
    console.log('👂 Listening on channel: data_change');
    await attachHandlers(client);
    client.on('end', () => {
      console.warn('PG listener connection ended; scheduling reconnect');
      scheduleReconnect();
    });
    startHealthCheck();
    return client;
  } catch (e) {
    console.error('Failed to start PG listener', e);
    scheduleReconnect();
    throw e;
  }
}

export function getPgListenerStatus() {
  return {
    connected: !!listenerClient,
    lastNotificationAt,
    reconnectAttempts,
    relistenCount,
  };
}

export async function forceRelisten() {
  if (!listenerClient) throw new Error('No listener client');
  await listenerClient.query('UNLISTEN data_change');
  await listenerClient.query('LISTEN data_change');
  relistenCount++;
  return { relistenCount };
}
