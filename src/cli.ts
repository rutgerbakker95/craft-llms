#!/usr/bin/env node
import { build } from './build.js';
import { readConfig } from './config.js';

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === 'help' || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

if (command === 'build') {
  const config = readConfig();
  build(config)
    .then((result) => {
      console.log(`Generated ${result.totalFiles} pages.`);
      console.log(`Full output: ${result.fullPath}`);
      console.log(`Index output: ${result.indexPath}`);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Build failed: ${message}`);
      process.exit(1);
    });
} else {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

function printHelp(): void {
  console.log(`craft-llms build\n\nGenerates public/llms-full.txt and public/llms.txt from Craft CMS docs.\n\nEnvironment variables:\n  OUTPUT_DIR   Output directory (default: public)\n  BASE_URL     Base docs URL (default: https://craftcms.com/docs/5.x/)\n  DOCS_REPO    Docs repository (default: https://github.com/craftcms/docs)\n  DOCS_DIR     Local clone directory (default: .cache/craftcms-docs)`);
}
