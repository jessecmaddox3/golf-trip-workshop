# Host a private event

> **Quick take:** a real event needs a persistent Node server behind HTTPS, your private configuration and an initialized store. Every participant receives their own access link. The ZIP demo alone does not publish a website.

## Prepare the server

Finish [your private configuration](CUSTOMIZE.md) first. Use a host where you can run Node.js 22.12 or newer and an HTTPS reverse proxy on the same machine. Keep the process running with your host’s service manager. Local storage needs a persistent disk. This release is not a static GitHub Pages app or a drop-in serverless function.

Install the release, run `npm ci --include=dev --include=optional`, and set its private environment variables. Keep `GOLF_MODE=production`, the three private configuration paths, `GOLF_DATA_DIR`, `GOLF_ACCESS_FILE`, and the exact `GOLF_PUBLIC_ORIGIN`, such as `https://golf.example.invalid`. Replace that example hostname with your own. Do not put a path, credentials or query parameters in the origin.

Run these commands in the project folder:

```sh
npm run build
npm run setup
npm start
```

Build validates your configuration and creates `dist-private/`. Setup creates an empty event, private access registry and a local HTML page containing the access links. It refuses to replace an existing registry. Start binds the application to `127.0.0.1:5088`; configure `PORT` if needed.

Your reverse proxy must send **every path**, including `/assets/` and `/private/`, to this Node application and preserve the configured Host header. Do not serve `dist-private/`, `public/`, `.local/` or the project folder directly. The Node application performs sign-in before serving production assets.

For an operator already using Caddy, this is the relevant [reverse-proxy configuration](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy):

```caddyfile
golf.example.invalid {
    reverse_proxy 127.0.0.1:5088 {
        header_up Host {host}
    }
}
```

Replace the hostname, arrange DNS and HTTPS on your host, and keep the Node port on loopback. Configure your proxy and host logs to omit query strings: the first access-link request contains a sign-in credential. Do not enable a public cache for this app. Test an unsigned-in browser first: it should show the private-workshop sign-in message, including when an asset URL is requested directly.

## Give people their own access

Setup prints the path of `access-links.html`; it does not print or send the links. Open that local file on the server’s trusted operator account, or transfer it privately to your own computer. The JSON registry and HTML page both contain sensitive access material. Keep both private.

The organizer and scorekeeper links can change tournament records. Each participant link can view the event and save only that participant’s poll response. These are bearer links: someone who receives a link can use its identity. A successful sign-in sets an HttpOnly session cookie for eight hours and redirects away from the credential-bearing URL.

Use the private setup commands to manage access. Replace `PLAYER_ID` with an actual stable actor ID; `owner` and `scorekeeper` are also actor IDs.

```sh
npm run setup -- links
npm run setup -- rotate PLAYER_ID
npm run setup -- revoke PLAYER_ID
```

Rotate creates a new link for that identity and invalidates its old sessions. Revoke disables its link and sessions. Both refresh the private HTML page. Give the person their own new link yourself. The app sends no messages.

## Choose storage

**Local, the default:** `GOLF_STORAGE=local` keeps event records, poll responses, operation receipts, scorecard photos and quotas under `GOLF_DATA_DIR/store/`. Use a persistent private directory and a single deployed app instance. The store uses file locking and atomic replacement. An established missing or damaged store fails closed instead of silently creating a new event.

**Optional Upstash Redis:** set `GOLF_STORAGE=redis`, `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in the private environment before setup. Use credentials for your own database with read/write and scripting permissions; the [Upstash REST documentation](https://upstash.com/docs/redis/features/restapi) describes the endpoint and token. The event is kept in one Redis hash named `golf:{EVENT_ID}:store`, with atomic revision checks. The access registry still lives in the private filesystem. Do not delete an established hash or use an evicting/ephemeral database. Initialization is explicit; ordinary startup cannot recreate a missing Redis event.

## Back up the whole event

For local storage, stop the Node process before copying the complete private data directory, access registry, private configuration and private assets to protected backup storage. Keep the matching release version. Restart only after the copy completes. Test restores in a separate private location before depending on them.

For Redis, use a consistent database backup/export that preserves the complete event hash, together with private access/configuration/assets. Confirm your provider’s restore procedure. The app’s **Export event backup** downloads tournament state, not poll records, access links, operation receipts or the photo bytes. Download photos separately, or use the full server/database backup for a complete copy.

Protect browser recovery files too. Before restoring a server backup, have users export pending work and close their event tabs. Use a reviewed recovery procedure so an old browser draft cannot be mistaken for new shared work. There is no one-click structural migration or full database restore command in this release.

## Optional scorecard reading

Manual photo review works without a provider. To enable Gemini, set `GOLF_OCR_ENABLED=yes`, a private `GEMINI_API_KEY`, and a current image-capable `GEMINI_MODEL`. Select the model in your own account and check its current terms and pricing. The adapter uses [structured output](https://ai.google.dev/gemini-api/docs/structured-output) and requires eighteen cells per player.

The organizer or scorekeeper must confirm before sending a compressed scorecard image. The request includes expected player names. The browser removes image metadata during canvas recompression; you still need to review the visible content you send. Blank or unreadable cells stay blank. You confirm player assignments and whether numbers are strokes or relative to par before saving.

`GOLF_OCR_DAILY_LIMIT` defaults to 20 requests and permits 1 through 100. Quotas are stored durably per UTC day. Failed requests can consume quota. This is a request ceiling, not a guaranteed spending cap. No live account or model is needed for the synthetic tests.

## Optional US weather

Set `GOLF_WEATHER_ENABLED=yes`. Use the NWS `/points/{latitude},{longitude}` response to obtain your course area’s `gridId`, `gridX` and `gridY`, then set `GOLF_NWS_OFFICE`, `GOLF_NWS_GRID_X` and `GOLF_NWS_GRID_Y`. The [official API guide](https://www.weather.gov/documentation/services-web-api) explains that lookup and its limited forecast horizon. The app requests one configured area; it does not guess coordinates from your venue names.

Set `GOLF_NWS_USER_AGENT` to an application identifier you are comfortable sending to NWS. Optional `GOLF_NWS_DISCUSSION=yes` adds the office’s forecast discussion. Requests are cached for thirty minutes, concurrent refreshes are combined, and a failed refresh preserves a labeled older forecast when available. Trips outside the forecast window show missing coverage rather than invented real conditions.

If you also want an AI discussion summary, set `GOLF_WEATHER_SUMMARY_ENABLED=yes`, configure Gemini, and set `GOLF_WEATHER_SUMMARY_DAILY_LIMIT` from 1 through 24 (default 4). This separately sends the public discussion text to Gemini. The app labels AI summaries and preserves the source discussion. Use current official alerts and course staff instructions for weather decisions.
