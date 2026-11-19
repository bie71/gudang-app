/**
 * Lightweight in-memory Event Bus for cross-screen reactivity.
 */
class EventEmitter {
  constructor() {
    this.listeners = new Map();
  }

  subscribe(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event);
    set.add(callback);

    return () => {
      set.delete(callback);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  emit(event, data) {
    if (!this.listeners.has(event)) return;
    const set = this.listeners.get(event);
    set.forEach(callback => {
      try {
        callback(data);
      } catch (err) {
        console.log(`[EventBus] Error in listener for ${event}:`, err);
      }
    });
  }
}

export const eventBus = new EventEmitter();

export const APP_EVENTS = {
  PO_CHANGED: "PO_CHANGED",
  ITEMS_CHANGED: "ITEMS_CHANGED",
  BOOKKEEPING_CHANGED: "BOOKKEEPING_CHANGED",
};
