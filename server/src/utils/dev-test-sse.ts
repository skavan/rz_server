import { eventBus } from './event-bus.js';

let interval: NodeJS.Timeout | null = null;
let sequence = 0;

export function startDevSkuTestEvents() {
  if (process.env.NODE_ENV === 'production') return;
  if (interval) return;

  const fakeSkuIds = [999001, 999002, 999003];

  interval = setInterval(() => {
    sequence += 1;
    const resourceId = fakeSkuIds[sequence % fakeSkuIds.length];
    const payload = {
      type: 'dev_test_ping',
      resource: 'skus',
      resourceId,
      data: {
        id: resourceId,
        name: `DEV SKU Ping #${sequence}`,
        updatedAt: new Date().toISOString(),
        note: 'Synthetic SSE event for QA visibility',
      },
    } as const;

    eventBus.broadcast({
      event: 'data_change:skus',
      data: payload,
      meta: {
        timestamp: Date.now(),
        source: 'dev-test',
        audience: { homeIds: [2] },
      },
    });
  }, 15000);
}

export function stopDevSkuTestEvents() {
  if (!interval) return;
  clearInterval(interval);
  interval = null;
}
