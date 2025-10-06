import type { Response } from 'express';

export type RealtimeEvent = {
  event: string; // e.g., 'push_update' or 'data_change:products'
  data: any;
  meta?: { 
    timestamp?: number; 
    source?: string; 
    correlation_id?: string;
    audience?: { customerId?: number; homeIds?: number[] };
  };
};

type Subscriber = {
  res: Response;
  resources: Set<string> | null; // null => all events
  scope: { customerId?: number; homeIds?: number[] } | null;
};

/**
 * Minimal in-memory event bus for SSE clients. Not for production clustering.
 */
class EventBus {
  private subscribers: Set<Subscriber> = new Set();

  subscribe(res: Response, resources: string[] | undefined, scope: { customerId?: number; homeIds?: number[] } | null) {
    const sub: Subscriber = { res, resources: resources ? new Set(resources) : null, scope };
    this.subscribers.add(sub);
    return () => {
      this.subscribers.delete(sub);
    };
  }

  /** Returns total number of active SSE subscribers (optionally filtered by resource). */
  getSubscriberCount(resource?: string): number {
    if (!resource) return this.subscribers.size;
    let count = 0;
    for (const sub of this.subscribers) {
      if (!sub.resources || sub.resources.has(resource)) count++;
    }
    return count;
  }

  broadcast(event: RealtimeEvent) {
    const line = this.formatEvent(event);
    const resourceKey = this.getResourceFromEvent(event.event);
    let recipients = 0;
    let attempted = 0;
    for (const sub of Array.from(this.subscribers)) {
      // If subscriber filters resources, send only matching events
      if (sub.resources && resourceKey && !sub.resources.has(resourceKey)) continue;
      // If event has audience, enforce tenant scoping
      const aud = event.meta?.audience;
      if (aud && sub.scope) {
        if (aud.customerId && sub.scope.customerId && aud.customerId !== sub.scope.customerId) continue;
        if (aud.homeIds && aud.homeIds.length) {
          const subHomes = new Set(sub.scope.homeIds || []);
          const intersects = aud.homeIds.some(h => subHomes.has(h));
          if (!intersects) continue;
        }
      }
      attempted++;
      try {
        sub.res.write(line);
        recipients++;
      } catch {
        // drop broken connections
        this.subscribers.delete(sub);
      }
    }

    // Dev-only trace of outbound events
    if (process.env.NODE_ENV !== 'production') {
      if (event.event.startsWith('data_change') || event.event === 'push_update') {
        const aud = event.meta?.audience;
        console.log(`📤 SSE send ${event.event} -> ${recipients} client(s)`, {
          resource: resourceKey,
          audience: aud,
        });
        if (recipients === 0) {
          console.log(`🚫 SSE ${event.event} had no recipients`, {
            resource: resourceKey,
            attempted,
            subscribers: this.subscribers.size,
            audience: aud,
          });
        }
      }
    }
  }

  private formatEvent(evt: RealtimeEvent): string {
    const payload = JSON.stringify({ data: evt.data, meta: evt.meta });
    const ts = evt.meta?.timestamp ?? Date.now();
    return `event: ${evt.event}\nid: ${ts}\ndata: ${payload}\n\n`;
  }

  private getResourceFromEvent(eventName: string): string | null {
    // Expect patterns like 'data_change:products' -> 'products'
    const m = eventName.match(/^data_change:(.+)$/);
    return m ? m[1] : null;
  }
}

export const eventBus = new EventBus();
