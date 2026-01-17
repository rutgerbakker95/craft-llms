# craft-llms

Minimal Node.js TypeScript CLI that builds Craft CMS documentation snapshots into `llms-full.txt` and `llms.txt`.

## Requirements

- Node.js >= 20
- Git

## Setup

```bash
npm install
npm run build
```

## Usage

```bash
node dist/src/cli.js build
```

Outputs:
- `public/llms-full.txt`
- `public/llms.txt`

## Configuration

Environment variables (defaults shown):

- `OUTPUT_DIR=public`
- `BASE_URL=https://craftcms.com/docs/5.x/`
- `DOCS_REPO=https://github.com/craftcms/docs`
- `DOCS_DIR=.cache/craftcms-docs`

## Scheduler examples

- Netlify scheduled function: `examples/netlify/functions/llms-build-schedule.js` (uses `BUILD_HOOK_URL`).
- Render cron job command:

```bash
node dist/src/cli.js build
```

## Scripts

- `npm run build` - compile TypeScript
- `npm run lint` - run ESLint
- `npm run format` - run Prettier
- `npm test` - run tests
