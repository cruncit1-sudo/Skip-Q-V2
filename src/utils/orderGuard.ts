// Global hard guard preventing the order creation flow from being entered
// more than once concurrently. Lives at module scope so accidental re-entry
// from re-renders, realtime callbacks, or stray timers is blocked even if a
// stale React closure tries to fire it.

let orderInProgress = false;

export function beginOrder(): void {
  if (orderInProgress) {
    throw new Error("Order already in progress");
  }
  orderInProgress = true;
}

export function endOrder(): void {
  orderInProgress = false;
}

export function isOrderInProgress(): boolean {
  return orderInProgress;
}