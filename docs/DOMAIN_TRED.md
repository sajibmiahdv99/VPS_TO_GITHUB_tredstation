# Domain: tred.agentsupport360.tech

## DNS (required)

In your DNS panel for **agentsupport360.tech**, create:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| **A** | `tred` | `195.35.7.96` | 300 |

Remove/overwrite any existing `tred` record pointing elsewhere (currently `185.158.133.1`).

Optional AAAA (IPv6): `2a02:4780:12:d564::1` only if you want IPv6 and it reaches this VPS.

## After DNS propagates

```bash
# Caddy auto-issues Let's Encrypt once A record hits this VPS
systemctl restart caddy
curl -I https://tred.agentsupport360.tech/api/public/health
curl -I https://tred.agentsupport360.tech/supabase/rest/v1/
```

## URLs

| What | URL |
|------|-----|
| App | https://tred.agentsupport360.tech |
| Super admin | https://tred.agentsupport360.tech/sadmin |
| Staff admin | https://tred.agentsupport360.tech/admin |
| Supabase API | https://tred.agentsupport360.tech/supabase |
| Health | https://tred.agentsupport360.tech/api/public/health |

## Config locations

- Caddy: `/etc/caddy/Caddyfile` (source: `deploy/Caddyfile.production`)
- App: `/root/hermes-workstation/.env` → `PUBLIC_APP_URL`, `VITE_SUPABASE_URL`
- Supabase: `/root/supabase-docker/.env` → `SITE_URL`, `API_EXTERNAL_URL`, `SUPABASE_PUBLIC_URL`
