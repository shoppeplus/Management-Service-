# Repository Guidelines

## Project Structure & Module Organization

SmartSales Suite currently contains the Omnichannel Inbox frontend. `src/App.tsx` coordinates state and interactions. Reusable panels live in `src/components/`; domain types are in `src/types/`; fixed demo fixtures are in `src/data/`. Keep filtering and formatting helpers in `src/lib/`, and persistence or HTTP access in `src/services/`. Store static assets in `public/` and integration documentation in `docs/`. Generated production output belongs to `dist/` and must not be committed.

## Build, Test, and Development Commands

Use Node.js 22.12 or later and npm.

- `npm install`: install dependencies; keep `package-lock.json` updated.
- `npm run dev`: start Vite with local development reload.
- `npm run typecheck`: check strict TypeScript types.
- `npm run lint`: run ESLint, including React Hooks rules.
- `npm test`: run Vitest once; `npm run test:watch` starts watch mode.
- `npm run build`: typecheck and generate the production bundle.
- `npm run preview`: serve the built bundle for local review.

## Coding Style & Naming Conventions

Use TypeScript, two-space indentation, single quotes, and the existing semicolon-free style. Name React component files in PascalCase, such as `CustomerDetails.tsx`; use camelCase for functions and variables. Import types with `import type`. Extend shared domain types instead of introducing inconsistent shapes. Keep network calls inside service adapters and avoid placing business rules directly in JSX. Run ESLint before submitting changes.

## Testing Guidelines

Vitest tests live beside the code as `*.test.ts`. Cover observable behavior: combined filters, Vietnamese search, message and note mutations, persistence, validation, and failure handling. No numeric coverage threshold is currently configured. Run the complete test suite and build; manually verify desktop 1440px and narrow layouts, keyboard navigation, and success/error notifications when changing UI behavior.

## Commit & Pull Request Guidelines

No Git history was available when this guide was created. Adopt Conventional Commits, for example `feat(inbox): add team assignment`. Keep changes focused. Pull requests should describe the problem, resulting behavior, validation commands, and related issues. Include screenshots for interface changes and document API or environment changes.

## Security & Configuration

Use `.env.example` for configuration guidance. Never commit secrets; all `VITE_*` values are public browser configuration. Keep Demo and Live adapters distinct, never silently substitute demo data after API failures, and never describe mock channels or rule-based AI suggestions as live integrations. Demo `localStorage` is unsuitable for real customer records.
