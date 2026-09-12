# QRForge

Client-side QR code generator: URL, text, Wi-Fi, email, phone, SMS, and vCard
payloads with live preview and PNG/SVG export. Built as a Portal/Paste-style
public tool.

## Privacy

Everything runs in your browser:

- Payloads are generated locally — nothing is sent to any server.
- No accounts, no analytics, no history, no cookies or local storage.
- The web app makes no network requests; only static assets are served.

## Payload types

| Type  | Encodes                                                            |
| ----- | ------------------------------------------------------------------ |
| URL   | Validated http/https link (scheme-less input becomes https://)     |
| Text  | Any text                                                           |
| Wi-Fi | `WIFI:` join-network payload (WPA/WEP/open, hidden flag, escaping) |
| Email | `mailto:` with optional subject and body                           |
| Phone | `tel:` payload                                                     |
| SMS   | `SMSTO:` with optional message                                     |
| vCard | vCard 3.0 contact block                                            |

Export options: download PNG or SVG (white background baked in), or copy the
image to the clipboard. QR options: size (256/512/1024 px), error correction
(L/M/Q/H), and quiet-zone margin.

## Local development

```sh
npm install
npm run dev
```

## Checks

```sh
npm test            # payload + QR behavioral tests (vitest)
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run format      # prettier --write .
```

## Production build

```sh
npm run build       # tsc --noEmit && vite build → dist/
npm run preview     # serve the build locally
```

## Docker

```sh
docker build -t qrforge .
docker run -p 8080:8080 qrforge
```

The container serves the static build via nginx on port 8080 with a health
probe at `/healthz` (`HEALTHCHECK` included).

## Compose

```sh
docker compose up -d
```

Override the host port with `QRFORGE_PORT`:

```sh
QRFORGE_PORT=9000 docker compose up -d
```

## CI/CD

A single workflow (`.github/workflows/ci.yml`) runs on every push to `main`,
every `v*` tag, and all pull requests. It lints, format-checks, typechecks,
and tests the app, then builds the Docker image:

- Pushes to `main` publish `ghcr.io/brocahontaz/qrforge:latest` plus `main`
  and `sha-<hash>` tags.
- `v*` tags additionally publish semver tags (`:1.2.3` and `:1.2`).
- Pull requests build but do not push.

Deployment is manual — the workflow only publishes the image.

### Deploy on a host

```sh
docker compose -f deploy/compose.prod.yaml pull
docker compose -f deploy/compose.prod.yaml up -d
```

Important: the first publish creates the GHCR package as **private**. For
anonymous `docker pull` on the host, flip it to public once under repo →
Packages → package settings, or `docker login ghcr.io` on the host.

## Stack

Vite 7 + TypeScript + vanilla DOM, dark-first accessible UI, nginx static
hosting. The only runtime dependency is [`qrcode`](https://www.npmjs.com/package/qrcode).
