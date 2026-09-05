# rent-app

Standalone "rent a shop" marketing/signup site for LilTeam Shop —
`rent.lilteam.site`. Completely separate codebase and deployment from the
main LilTeam Shop app. It never connects to MongoDB directly; every real
operation (login, register, buy a plan, create a shop, renew, top up
wallet) goes through a small authenticated internal API exposed by the
main app at `/internal/api/*` (see `src/routes/internal-api.js` and
`src/services/shop-provisioning.js` in the main repo).

## Why it's built this way

The main app stores each shop (including its own "main" site data —
products, orders, users, settings, everything) as **one full-document
MongoDB replace per save**. A second, independently-coded app that
connected to that same document directly and saved its own partial view
of the data would silently wipe out every collection it doesn't know
about. So this app talks to the main app's existing, already-safe logic
over HTTP instead of touching the database itself — see the main repo's
plan notes for the full reasoning.

## Local development

```bash
npm install
cp .env.example .env   # fill in MAIN_API_BASE_URL + INTERNAL_API_SECRET
npm run dev
```

The main app must be running with a matching `INTERNAL_API_SECRET` set
(same value, both sides) for anything here to work — every request is
rejected with 403 otherwise.

## Production deployment (on the same VPS as the main app)

1. **Add the shared secret to the main app.** SSH into the VPS (ReadyIDC)
   and add a line to `/opt/lilteam/.env` (do NOT recreate/overwrite the
   file — just append):
   ```
   INTERNAL_API_SECRET=<a long random value, e.g. `openssl rand -hex 32`>
   ```
   Restart the main app's container so it picks up the new env var
   (`docker compose restart app`, from `/opt/lilteam/app/deploy/community/`).

2. **Create `/opt/lilteam/rent-app.env`** on the VPS with:
   ```
   MAIN_API_BASE_URL=http://app:3000
   INTERNAL_API_SECRET=<the exact same value as step 1>
   SESSION_SECRET=<a different long random value>
   MAIN_SITE_URL=https://lilteam.site
   SHOP_NAME=LilTeam Shop
   LOGO_IMAGE=<your logo's R2 URL, or leave unset for the emoji fallback>
   ```

3. **Find the main app's actual Docker network name**:
   ```bash
   docker network ls
   ```
   Look for the network the `app` and `mongodb` containers are on. Open
   `compose.yml` in this project and set `networks.main_internal.name` to
   that exact value if it isn't `community_internal`.

4. **Deploy this app** (from this folder, on the VPS):
   ```bash
   docker compose up -d --build
   ```
   It listens on `127.0.0.1:3001` (not exposed publicly by itself — same
   pattern as the main app's `127.0.0.1:3000`).

5. **Point `rent.lilteam.site` at it in Nginx.** Add a new server block
   (do not touch the existing one that serves the main app):
   ```nginx
   server {
     listen 443 ssl http2;
     server_name rent.lilteam.site;

     # reuse whatever SSL cert/config the main site's server block uses
     # (Cloudflare origin cert, or wherever your certs live)
     ssl_certificate     /path/to/your/cert.pem;
     ssl_certificate_key /path/to/your/key.pem;

     location / {
       proxy_pass http://127.0.0.1:3001;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
     }
   }
   ```
   Reload Nginx (`nginx -t && systemctl reload nginx`).

6. **Verify**: `https://rent.lilteam.site` should load the landing page
   with real pricing plans. Register a test account, buy the cheapest
   plan, confirm the shop shows up under `/my-shops` (both here and, once
   logged into the main site as that same user, at
   `https://lilteam.site/my-shops`).

## What's NOT handled here

- This app has no admin panel of its own — everything about a shop
  (products, stock, settings) is still managed at
  `https://<shop-slug>.lilteam.site/admin`, unchanged.
- Sessions are not shared with the main site — logging in here and
  logging in at `lilteam.site` are separate sessions on separate
  cookies, by design (the two apps are genuinely decoupled).
