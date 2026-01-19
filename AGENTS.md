# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Project Overview

craft-llms is a CLI tool that generates LLM-friendly documentation files from the Craft CMS docs repository. It clones/updates the craftcms/docs repo, processes the markdown files, and outputs two files:
- `public/llms-full.txt` - Full concatenated documentation with all pages
- `public/llms.txt` - Index of all pages with titles, URLs, and summaries

## Commands

```bash
npm run build          # Compile TypeScript to dist/
npm run build:watch    # Watch mode compilation
npm run lint           # ESLint with zero warnings allowed
npm run format         # Format with Prettier
npm run format:check   # Check formatting
npm run test           # Build then run tests with Node test runner
```

Run a single test:
```bash
npm run build && node --test dist/test/markdown.test.js
```

Run the CLI locally:
```bash
node dist/src/cli.js build
```

## Architecture

The tool follows a pipeline architecture:

1. **CLI Entry** (`src/cli.ts`) - Parses commands, reads config from environment
2. **Config** (`src/config.ts`) - Reads `OUTPUT_DIR`, `BASE_URL`, `DOCS_REPO`, `DOCS_DIR` from env with defaults
3. **Git** (`src/git.ts`) - Clones/pulls the docs repo to `.cache/craftcms-docs`
4. **Build** (`src/build.ts`) - Orchestrates the build: collects markdown files, processes each, generates output
5. **Markdown** (`src/markdown.ts`) - Core processing functions:
   - `expandIncludeDirectives` - Resolves `!!!include(path)!!!` directives recursively
   - `stripFrontmatter`, `stripVuePressDirectives` - Clean VuePress-specific syntax
   - `normalizeLinks` - Converts relative `.md` links to absolute URLs
   - `extractTitle`, `extractSummary` - Parse page metadata

The docs are sourced from `docs/docs/5.x/` or `docs/5.x/` within the cloned repo.

## Key Patterns

- Uses Node.js built-in test runner (`node:test`)
- ESM modules with `.js` extensions in imports (TypeScript compiles to ESM)
- Tests import from compiled `dist/` directory
- Component tags (VuePress custom components) are handled by tag name sets in `markdown.ts`: `INLINE_COMPONENT_TAGS`, `DROP_COMPONENT_TAGS`, `STANDARD_HTML_TAGS`
