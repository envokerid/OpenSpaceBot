# OpenMausBot website

Next.js App Router with TypeScript and the [OpenNext Cloudflare adapter](https://opennext.js.org/cloudflare/get-started), targeting Cloudflare Workers.

Use Node.js 24+ and the repository's pnpm version. Install dependencies from the repository root:

```sh
pnpm install
cd website
cp .dev.vars.example .dev.vars
pnpm dev
```

Edit `src/app/page.tsx` to build the homepage. `pnpm dev` runs the Next.js development server; `pnpm preview` builds and runs the app locally in the Workers runtime.

## Commands

Run these from `website/`, or use `pnpm --filter @openmausbot/website <command>` from the repository root:

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start Next.js development |
| `pnpm lint` | Check source code |
| `pnpm typecheck` | Generate Cloudflare/Next.js types and check TypeScript |
| `pnpm build` | Build Next.js |
| `pnpm build:worker` | Build Next.js and adapt the output for Workers |
| `pnpm dry-run` | Build and validate the Worker bundle without deploying |
| `pnpm preview` | Build and preview locally with Wrangler |
| `pnpm deploy` | Build and deploy to Cloudflare Workers |
| `pnpm upload` | Build and upload a version without activating it |
| `pnpm cf-typegen` | Regenerate types after changing Worker bindings |

## Cloudflare deployment

Authenticate with `pnpm exec wrangler login`, then run `pnpm deploy`. For CI, supply `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as secrets. No Cloudflare credentials are needed to build or run a deployment dry run.

The Worker is named `openmausbot-website`. If renaming it in `wrangler.jsonc`, also update the `WORKER_SELF_REFERENCE` service to match. Keep the default Next.js Node.js runtime; OpenNext does not use `runtime = "edge"`.

The starter does not provision remote storage. Before adding ISR or persistent Next.js caching, configure an [OpenNext cache backend](https://opennext.js.org/cloudflare/caching) and its corresponding bindings in `wrangler.jsonc`. The `IMAGES` binding supports Cloudflare image optimization when using `next/image`.

Keep local secrets in the ignored `.dev.vars` file and production secrets in Wrangler. Generated `.next/`, `.open-next/`, `.wrangler/`, and binding type files are ignored by Git.

## Product imagery

`public/product/` contains locally captured product visuals (29 September 2026):

- `desktop.webp`: the real desktop renderer, connected to an isolated verification server with a fictional team and scripted launch-planning conversation.
- `mobile.webp`: the Expo app's actual `Roster` component rendered through React Native Web in an isolated 390 × 780 preview. Native-only menus are inactive in the capture fixture, and avatar surfaces use exports from the shared renderer. This is a component preview, not a native device screenshot.
- `avatar-*.webp`: transparent 512 × 512 exports from `shared/orb-scene.ts`, the app's own avatar renderer.

Screenshots contain demo data, no personal conversations or credentials. Images are pre-encoded as WebP; Next Image uses `unoptimized` to serve these small static assets directly on Workers. Screenshot frames and backgrounds are CSS. Full screenshots are linked from the gallery.
