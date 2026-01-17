import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDocsRepo, getRepoMeta } from './git.js';
import {
  docPathToUrl,
  extractSummary,
  extractTitle,
  normalizeLinks,
  stripFrontmatter,
  stripVuePressDirectives
} from './markdown.js';
import type { BuildConfig } from './config.js';

export type BuildResult = {
  fullPath: string;
  indexPath: string;
  totalFiles: number;
};

type IndexEntry = {
  title: string;
  url: string;
  summary: string;
  relPath: string;
};

export async function build(config: BuildConfig): Promise<BuildResult> {
  const docsRepoDir = path.resolve(config.docsDir);
  const outputDir = path.resolve(config.outputDir);
  const baseUrl = config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`;

  await ensureDocsRepo(docsRepoDir, config.docsRepo);
  const primaryDocsRoot = path.join(docsRepoDir, 'docs', 'docs', '5.x');
  const fallbackDocsRoot = path.join(docsRepoDir, 'docs', '5.x');
  const docsRoot = await resolveDocsRoot([primaryDocsRoot, fallbackDocsRoot]);

  const files = await collectMarkdownFiles(docsRoot);
  const { commit, timestamp } = await getRepoMeta(docsRepoDir);

  const headerLines = [
    '# Craft CMS Documentation',
    'Craft CMS 5.x documentation covering installation, configuration, templating, and extension points.',
    `Last updated: ${timestamp} (commit ${commit})`,
    ''
  ];

  const pageChunks: string[] = [];
  const indexGroups = new Map<string, IndexEntry[]>();

  for (const filePath of files) {
    const raw = await fs.readFile(filePath, 'utf8');
    const withoutFrontmatter = stripFrontmatter(raw);
    const cleaned = stripVuePressDirectives(withoutFrontmatter);

    const relPath = toPosixPath(path.relative(docsRoot, filePath));
    const fallbackTitle = path.basename(filePath, path.extname(filePath));
    const title = extractTitle(cleaned, fallbackTitle);

    const normalizedContent = normalizeLinks(cleaned, {
      baseUrl,
      currentFilePath: relPath
    }).trimEnd();

    pageChunks.push('---', `# ${title}`, normalizedContent, '');

    const summary = extractSummary(cleaned);
    const url = docPathToUrl(relPath, baseUrl);
    const group = relPath.includes('/') ? relPath.split('/')[0] : 'root';
    const entries = indexGroups.get(group) ?? [];
    entries.push({ title, url, summary, relPath });
    indexGroups.set(group, entries);
  }

  const fullText = `${headerLines.join('\n')}\n${pageChunks.join('\n').trimEnd()}\n`;

  const indexLines: string[] = [];
  indexLines.push('# Craft CMS Documentation Index');
  indexLines.push(`Last updated: ${timestamp} (commit ${commit})`, '');

  const sortedGroups = Array.from(indexGroups.keys()).sort((a, b) => a.localeCompare(b));
  for (const group of sortedGroups) {
    indexLines.push(`## ${group}`);
    const entries = indexGroups.get(group) ?? [];
    entries.sort((a, b) => a.relPath.localeCompare(b.relPath));
    for (const entry of entries) {
      const summary = entry.summary ? ` — ${entry.summary}` : '';
      indexLines.push(`- [${entry.title}](${entry.url})${summary}`);
    }
    indexLines.push('');
  }

  const indexText = `${indexLines.join('\n').trimEnd()}\n`;

  await fs.mkdir(outputDir, { recursive: true });
  const fullPath = path.join(outputDir, 'llms-full.txt');
  const indexPath = path.join(outputDir, 'llms.txt');
  await fs.writeFile(fullPath, fullText, 'utf8');
  await fs.writeFile(indexPath, indexText, 'utf8');

  return { fullPath, indexPath, totalFiles: files.length };
}

async function resolveDocsRoot(candidates: string[]): Promise<string> {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }
  throw new Error(`Docs path not found. Checked: ${candidates.join(', ')}`);
}

async function collectMarkdownFiles(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];

  const dirs = entries.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  const mdFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const file of mdFiles) {
    files.push(path.join(rootDir, file.name));
  }

  for (const dir of dirs) {
    const childPath = path.join(rootDir, dir.name);
    const childFiles = await collectMarkdownFiles(childPath);
    files.push(...childFiles);
  }

  return files;
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}
