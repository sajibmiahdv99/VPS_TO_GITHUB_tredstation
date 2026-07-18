# Hermes Execution Worker Contract

MetaTrader 5 (native DLL) and some exchange WebSocket order routers cannot
run inside the main web process on all deployments.

Execution therefore happens in an **external worker** the user hosts (VPS,
home machine, container). The worker pulls queued orders, places them with
the broker / exchange, and reports the fill back.

## Order lifecycle

```
signal -> pipeline.functions.ts (parse + risk) -> orders (status='queued')
   -> worker calls claimQueuedOrders -> status='dispatched'
   -> worker places trade on MT5 / exchange
   -> worker calls reportExecution -> status='filled' | 'rejected' | ...
   -> worker polls broker for close, calls reportExecution again with pnl
```

## Auth

The worker authenticates as the **end user**: it signs in with the user's
Lovable Cloud credentials (or a personal-access token) and reuses the JWT.
Every call goes through `requireSupabaseAuth`; RLS confines the worker to
its own orders.

## API surface

Both endpoints are TanStack server functions; call them as RPC over HTTPS.

### `claimQueuedOrders({ limit })`
- Returns up to `limit` orders with `status='queued'`.
- Server flips them to `status='dispatched'` atomically so a second poll
  does not re-deliver them.

### `reportExecution({ orderId, status, fillPrice?, filledQuantity?, pnl?, exchangeOrderId?, errorMessage? })`
- `status`: one of `filled | partial | open | cancelled | rejected | closed`.
- Worker calls this after the broker confirms, and again on position close
  with the final PnL.

## Recommended worker loop

```
loop forever:
    orders = claimQueuedOrders(limit=10)
    for order in orders:
        try:
            broker_resp = mt5.order_send(...)  # or ccxt.create_order
            reportExecution(orderId=order.id, status='filled',
                            fillPrice=broker_resp.price,
                            filledQuantity=broker_resp.volume,
                            exchangeOrderId=str(broker_resp.id))
        except Exception as e:
            reportExecution(orderId=order.id, status='rejected',
                            errorMessage=str(e))
    sleep(2)
```

A reference Python implementation lives in the original Hermes repo under
`backend/services/mt5_bridge.py`; it can be ported to call the two RPCs
above instead of writing to the Express API.
