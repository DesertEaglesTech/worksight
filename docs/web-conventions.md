# Web working agreements

The repository initially contained LICENSE, a short README and start.txt. No application conventions were found. LICENSE, start.txt and Git history are preserved.

- Web source stays in `web/`, separate from ML/FastAPI. Next.js App Router, strict TypeScript, Tailwind CSS and shared CSS visual tokens.
- Response schemas live in `src/lib/contract.ts`, live transport in `api.ts`, temporary fixtures in `demo.ts`. Regenerate the OpenAPI proposal when the contract changes.
- Backend owns durable records. Do not add a separate browser or web-server profile database.
- Select mode through server environment configuration. Never silently fall back to demo. Keep mode configuration explicit in server settings and documentation. The operator UI omits mode banners and fixture disclosures at the user’s request.
- Gate optional features using capabilities. Never infer measured time, confidence, GPU state or quality improvement.
- Keep the original model decision visible and separate from engineer confirmation. Bind results to the exact version used.
- Keep secrets on the server, in ignored env files or deployment secrets, never in `NEXT_PUBLIC_*` or Git.
- Validate uploads, release object URLs, handle failed/cancelled/timed-out jobs. Backend independently validates files.
- Run type checking, unit tests, production build and the operator browser scenario after behavior changes.
- English, keyboard-operable UI with visible focus, readable errors and responsive image comparison. No auth, billing, chat or sensor monitoring in v1.

## Operator interface

- Design reference: [CVAT interface overview](https://www.cvat.ai/academy/cvat-overview). Use a neutral light surface, dark text and a restrained orange action color. Keep the image workspace primary.
- Use direct task labels: Part inspection, Reference samples, Model result and Engineer review. Avoid promotional headlines, uppercase section labels and decorative icons.
- Primary text and controls use 15–16 px type, page titles 26–32 px. Supporting metadata can be 12–14 px. Keep borders for structural separation rather than independent cards for every value.
- Put display settings, the model result and the independent engineer review into one sidebar. Inspection details show actual file and backend record fields, never inferred model metrics.
- Zoom, pan, fit and overlay opacity are local display controls. Transform original and heatmap together, and preserve their alignment. The displayed zoom percentage is a view setting, not confidence.
- Profile search filters the records already returned by the backend and never writes a separate profile store.

- Keep task navigation on the left with active section and selected profile context. Allow collapsing it for image review and use a dismissible drawer on mobile. Navigation must preserve the current inspection.
