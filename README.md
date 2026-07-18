# AGENT TRED (Tred Station)

Self-hosted AI crypto signal trading workstation.

**Live:** https://tred.agentsupport360.tech  
**Super admin:** `/sadmin` · **Control Center:** `/sadmin/control`

## Stack

- TanStack Start + React 19 + Vite 8 + Nitro
- Self-hosted Supabase (Docker)
- Caddy HTTPS
- Workers: cron, price-relay, telegram-poller

## Quick start

```bash
cp .env.example .env
# fill keys — never commit .env
npm install --legacy-peer-deps
npm run build
node .output/server/index.mjs
```

See `docs/DEPLOY_VPS.md`, `docs/DOMAIN_TRED.md`, `docs/ULTIMATE_ROADMAP.md`.

## Security

Do not commit `.env`, vault keys, or production secrets. Use Control Center vault or server env.
