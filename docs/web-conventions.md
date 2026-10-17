# Web working agreements

The repository initially contained LICENSE, a short README and start.txt. No application conventions were found. LICENSE, start.txt and Git history are preserved.

- Web source stays in `web/`, separate from ML/FastAPI. Next.js App Router, strict TypeScript, Tailwind CSS and shared CSS visual tokens.
- Response schemas live in `src/lib/contract.ts`, live transport in `backend-api.ts`, backend payload validation in `backend-contract.ts`, temporary fixtures in `demo.ts`. Regenerate the archived proposal schemas when the normalized UI contract changes; the actual API is documented in `API.md` and `/openapi.json`.
- Backend owns durable records. Do not add a separate browser or web-server profile database.
- Select mode through server environment configuration. Never silently fall back to demo. Keep mode configuration explicit in server settings and documentation. The operator UI omits mode banners and fixture disclosures at the user’s request.
- Gate optional features using capabilities. Never infer measured time, confidence, GPU state or quality improvement.
- Keep the original model decision visible and separate from engineer confirmation. Bind results to the exact version used.
- Keep secrets on the server, in ignored env files or deployment secrets, never in `NEXT_PUBLIC_*` or Git.
- Validate uploads, release object URLs, handle failed/cancelled/timed-out jobs. Backend independently validates files.
- Run type checking, unit tests, production build and the operator browser scenario after behavior changes.
- English, keyboard-operable UI with visible focus, readable errors and responsive image comparison. No auth, billing, chat or sensor monitoring in v1.

## Operator interface

- Production appearance follows the original [published Worksight](https://web-production-d9743.up.railway.app/): white left navigation, light grey workspace, orange actions and soft corners. Keep the image workspace primary; never recolour the image or heatmap when changing theme.
- Use direct task labels: Part inspection, Reference samples, Model result and Engineer review. Avoid promotional headlines, uppercase section labels and decorative icons.
- Primary text and controls use 15–16 px type, page titles 26–32 px. Supporting metadata can be 12–14 px. Keep borders for structural separation rather than independent cards for every value.
- Order the review sidebar as Model result → Engineer review → optional update → collapsed Image display and Inspection details. Preserve normal page scrolling. Compare uses the full image workspace with review below it on desktop. Inspection details show actual file and backend record fields, never inferred model metrics.
- Zoom, pan, fit and overlay opacity are local display controls. Transform original and heatmap together, and preserve their alignment. The displayed zoom percentage is a view setting, not confidence.
- Profile search filters the records already returned by the backend and never writes a separate profile store.

- Production uses fixed left task navigation with a collapsed rail and a dismissible mobile drawer. The icon-only theme switch sits at the top right of the desktop page heading, and in the mobile header. Navigation and theme changes must preserve the inspection and unsaved engineer inputs.

## Design alternatives

- The original design is selected for `/`. Base appearance stays in `globals.css`; preserved
  workflow refinements are scoped to `.design-current` in `app/original.css`, and its dark theme
  is in `app/original-theme.css`. Model result leads directly into engineer review, its sidebar
  has normal page scrolling and Compare keeps synchronized zoom/pan and adaptive frames.
- 02 Engineering remains available in the archive with its styles in `app/engineering.css` and
  `app/engineering-theme.css`. The other archived designs retain their own palettes/layouts.
- The `worksight_theme` preference cookie contains only `light` or `dark`, is read during server
  rendering and updated by the toggle, and never stores profile data, images or secrets.
- `/designs` remains an archive/comparison page: Original, 01 Corporate, 02 Engineering and the
  three additional alternatives. Corporate stays in `app/designs/designs.css`; Engineering is
  shared with production. The comparison toolbar and its navigation offsets apply only inside
  `.design-preview`.
- All views share one mounted Workspace and the configured API. Changing design preserves
  the current image, result, engineer inputs and profile. The preview performs real backend
  operations when live mode is configured; no additional fixture records or invented metrics.
- Direct links: `/designs?style=corporate`, `/designs?style=engineering`, `/designs?style=current`.
- Three additional alternatives are isolated in `app/designs/more-designs.css`: 03 Editorial
  (`style=editorial`, warm paper, serif headings, ink rules), 04 Laboratory (`style=lab`, low-glare
  charcoal surfaces), 05 Field (`style=field`, green-grey surfaces, full-width photo with review
  beneath). These alternatives remain separate from the selected production design. The comparison
  selector scrolls on narrower desktops and uses a native select on mobile for all six options.
