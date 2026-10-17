# Worksight

Industrial visual inspection for quality engineers, with a separately developed AMD ML backend. Create profiles from known-good samples, inspect an image, compare the heatmap with a similar reference and record engineer feedback separately from the model decision.

## Current status

The Next.js web app supports the full operator flow in a clearly labelled **synthetic demo**. A live API adapter and server proxy implement a **proposed** contract awaiting ML developer confirmation. Actual FastAPI integration and AMD inference validation require that service. No GPU status, confidence percentage, benchmark or quality improvement is fabricated.

Version history, comparison and rollback are capability-gated and marked **Planned** until implemented by the backend. Demo builds simulate version changes without training. Demo data resets on reload. FastAPI owns all durable live records.

## Run the web app

Requirements: Node.js 24 LTS and npm.

```bash
cd web
npm ci
cp .env.example .env.local
npm run dev
```

Open http://127.0.0.1:3000. The example env selects demo explicitly. Development uses Webpack for compatibility with macOS file watching. On a host with restricted file watching, run the production build and start commands below.

## Operator flow

1. Click **New profile**, enter a part name and camera view.
2. Add known-good JPEG, PNG or WebP images, or choose **Use synthetic sample** in demo. Click **Upload samples**, then **Build profile**.
3. Click **Inspect with this profile**. Upload a new image or choose the synthetic defective part, then **Run inspection**.
4. Adjust heatmap opacity and switch between Heatmap, Original and Compare.
   Use the viewer's zoom controls and Fit button to examine the surface. Drag to pan when zoomed in. Image display settings and engineer review share the right sidebar.
5. Choose a **Human decision**, add a note and save. The model decision remains unchanged.
6. **Update profile** when supported. Inspect again to see a result using the new version. Existing inspections keep their original version.

Demo inspection returns a fixed example regardless of upload content. It demonstrates UI behavior and cannot assess real parts. The interface states this limitation.

## Connect FastAPI

Set these in `web/.env.local` or server secrets, then restart:

```dotenv
WORKSIGHT_MODE=live
WORKSIGHT_API_URL=http://127.0.0.1:8000
WORKSIGHT_API_TOKEN=
```

The URL is the backend origin without `/v1`. The optional token stays server-side. Never prefix credentials with `NEXT_PUBLIC_`. Browser calls go through `/api/backend/v1/...`, so this pattern does not require browser-to-FastAPI CORS.

See the [API proposal](docs/api-contract.md) and [OpenAPI proposal](docs/openapi.proposed.json). These require ML developer confirmation. Live failures never switch to demo. Without an explicit mode the app shows setup instructions and disables operations.

## Production and deployment

```bash
cd web
npm ci
npm run build
npm start
```

The build prepares a standalone Next.js server including static assets. PORT defaults to 3000. Configure the mode, backend URL and optional token at runtime. Deploy to any Node-compatible host. On Vercel choose project root `web/` and configure the same server variables.

Container deployment from `web/`:

```bash
docker build -t worksight-web .
docker run --rm -p 3000:3000 --env-file .env.local worksight-web
```

Live deployment belongs on the intended internal network or behind the host's access controls. Application authentication is outside v1 scope. A hosted demo uses synthetic data only.

## Validation

```bash
cd web
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Tests cover upload rejection, schema validation, proxy restrictions, bounded uploads, outages, failed/cancelled jobs and separate model/human decisions. The browser scenario covers creation through repeat inspection with an updated profile and a mobile viewport. Some restricted hosts block Chromium startup; see [verification](docs/verification.md) for actual results and a manual checklist.

## Layout

```text
web/src/app/          Next.js pages, styles and server proxy
web/src/components/   Operator workspace and upload previews
web/src/lib/          Schemas, API client, jobs and disposable fixtures
web/tests/            Contract and operator tests
docs/                Contract, conventions and verification
submission/          Cover, description, slides and demo materials
```

[Web conventions](docs/web-conventions.md) · [Submission draft](submission/description.md) · [Demo script](submission/demo-script.md)

## License

See [LICENSE](LICENSE).
