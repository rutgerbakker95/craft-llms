export type BuildConfig = {
  outputDir: string;
  baseUrl: string;
  docsRepo: string;
  docsDir: string;
};

const DEFAULTS: BuildConfig = {
  outputDir: 'public',
  baseUrl: 'https://craftcms.com/docs/5.x/',
  docsRepo: 'https://github.com/craftcms/docs',
  docsDir: '.cache/craftcms-docs'
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): BuildConfig {
  return {
    outputDir: env.OUTPUT_DIR ?? DEFAULTS.outputDir,
    baseUrl: env.BASE_URL ?? DEFAULTS.baseUrl,
    docsRepo: env.DOCS_REPO ?? DEFAULTS.docsRepo,
    docsDir: env.DOCS_DIR ?? DEFAULTS.docsDir
  };
}
