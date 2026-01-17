import fs from 'node:fs/promises';
import path from 'node:path';

type FenceState = {
  inFence: boolean;
  fenceMarker: '```' | '~~~' | '';
};

const INLINE_LINK_RE = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g;
const HEADING_RE = /^#{1,6}\s+/;
const LIST_RE = /^\s*([-*+]|\d+\.)\s+/;
const INCLUDE_DIRECTIVE_RE = /!!!include\(([^)]+)\)!!!/g;
const COMPONENT_TAG_RE = /<\/?([A-Za-z][^\s/>]*)(\s[^>]*)?>/g;
const HTML_TAG_ONLY_RE = /^<[^>]+>$/;
const INLINE_COMPONENT_TAGS = new Set(['badge', 'cloud', 'journey', 'see', 'since', 'todo']);
const DROP_COMPONENT_TAGS = new Set(['block', 'browsershot', 'codeplaceholder', 'column', 'columns', 'tab', 'tabs']);
const STANDARD_HTML_TAGS = new Set([
  'a',
  'abbr',
  'address',
  'article',
  'aside',
  'audio',
  'b',
  'blockquote',
  'br',
  'button',
  'caption',
  'cite',
  'code',
  'col',
  'colgroup',
  'data',
  'datalist',
  'dd',
  'del',
  'details',
  'dfn',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'i',
  'img',
  'input',
  'ins',
  'kbd',
  'label',
  'li',
  'main',
  'mark',
  'nav',
  'ol',
  'p',
  'pre',
  'q',
  's',
  'samp',
  'section',
  'small',
  'span',
  'strong',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'textarea',
  'tfoot',
  'th',
  'thead',
  'time',
  'tr',
  'u',
  'ul',
  'var'
]);

function updateFenceState(line: string, state: FenceState): FenceState {
  const trimmed = line.trim();
  const marker = trimmed.startsWith('```') ? '```' : trimmed.startsWith('~~~') ? '~~~' : '';
  if (!marker) {
    return state;
  }
  if (!state.inFence) {
    return { inFence: true, fenceMarker: marker };
  }
  if (state.fenceMarker === marker) {
    return { inFence: false, fenceMarker: '' };
  }
  return state;
}

export function stripFrontmatter(content: string): string {
  const lines = content.split('\n');
  if (lines.length === 0 || lines[0].trim() !== '---') {
    return content;
  }

  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      return lines.slice(i + 1).join('\n');
    }
  }

  return content;
}

export async function expandIncludeDirectives(
  content: string,
  options: { repoRoot: string; currentFilePath: string; maxDepth?: number },
): Promise<string> {
  const repoRoot = path.resolve(options.repoRoot);
  const maxDepth = options.maxDepth ?? 5;
  const cache = new Map<string, string>();

  const expand = async (
    input: string,
    filePath: string,
    depth: number,
    stack: Set<string>,
  ): Promise<string> => {
    if (depth > maxDepth) {
      throw new Error(`Include depth exceeded ${maxDepth} at ${filePath}`);
    }

    const matches = Array.from(input.matchAll(INCLUDE_DIRECTIVE_RE));
    if (matches.length === 0) {
      return input;
    }

    let result = '';
    let lastIndex = 0;
    for (const match of matches) {
      const matchIndex = match.index ?? 0;
      result += input.slice(lastIndex, matchIndex);
      lastIndex = matchIndex + match[0].length;

      const includePath = match[1].trim();
      const resolvedPath = resolveIncludePath(includePath, repoRoot, filePath);

      if (stack.has(resolvedPath)) {
        throw new Error(`Include cycle detected at ${resolvedPath}`);
      }

      let included = cache.get(resolvedPath);
      if (included === undefined) {
        included = await fs.readFile(resolvedPath, 'utf8');
        cache.set(resolvedPath, included);
      }

      stack.add(resolvedPath);
      const expanded = await expand(included, resolvedPath, depth + 1, stack);
      stack.delete(resolvedPath);
      result += expanded;
    }

    result += input.slice(lastIndex);
    return result;
  };

  return expand(content, options.currentFilePath, 0, new Set<string>());
}

export function stripVuePressDirectives(content: string): string {
  const lines = content.split('\n');
  let state: FenceState = { inFence: false, fenceMarker: '' };
  const output: string[] = [];

  for (const line of lines) {
    state = updateFenceState(line, state);
    if (state.inFence) {
      output.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (trimmed.startsWith(':::') || trimmed.startsWith('!!!')) {
      continue;
    }

    const withoutComments = stripHtmlComments(line);
    const replaced = replaceComponentTags(withoutComments);
    output.push(replaced);
  }

  return output.join('\n');
}

export function extractTitle(content: string, fallback: string): string {
  const lines = content.split('\n');
  let state: FenceState = { inFence: false, fenceMarker: '' };

  for (const line of lines) {
    state = updateFenceState(line, state);
    if (state.inFence) {
      continue;
    }
    const match = line.match(/^#\s+(.+?)\s*#*\s*$/);
    if (match) {
      return match[1].trim();
    }
  }

  return fallback;
}

export function stripLeadingH1(content: string): string {
  const lines = content.split('\n');
  let state: FenceState = { inFence: false, fenceMarker: '' };
  let removed = false;
  const output: string[] = [];

  for (const line of lines) {
    state = updateFenceState(line, state);
    if (!state.inFence && !removed && /^#\s+/.test(line)) {
      removed = true;
      continue;
    }
    output.push(line);
  }

  return output.join('\n');
}

export function docPathToUrl(relativePath: string, baseUrl: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const posixPath = relativePath.replace(/\\/g, '/').replace(/^\//, '');
  const mapped = mapDocPath(posixPath);
  return `${normalizedBase}${mapped.replace(/^\//, '')}`;
}

export function normalizeLinks(
  content: string,
  options: { baseUrl: string; currentFilePath: string },
): string {
  const lines = content.split('\n');
  let state: FenceState = { inFence: false, fenceMarker: '' };
  const output: string[] = [];

  for (const line of lines) {
    state = updateFenceState(line, state);
    if (state.inFence) {
      output.push(line);
      continue;
    }

    const normalizedInline = line.replace(INLINE_LINK_RE, (match, text, destination) => {
      const normalizedDestination = normalizeLinkDestination(
        destination,
        options.currentFilePath,
        options.baseUrl,
      );
      return `[${text}](${normalizedDestination})`;
    });

    const normalizedReference = normalizeReferenceDefinition(
      normalizedInline,
      options.currentFilePath,
      options.baseUrl,
    );

    output.push(normalizedReference);
  }

  return output.join('\n');
}

export function extractSummary(content: string): string {
  const lines = content.split('\n');
  let state: FenceState = { inFence: false, fenceMarker: '' };
  const paragraph: string[] = [];

  for (const line of lines) {
    state = updateFenceState(line, state);
    if (state.inFence) {
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      if (paragraph.length > 0) {
        break;
      }
      continue;
    }

    if (HEADING_RE.test(trimmed) || LIST_RE.test(trimmed)) {
      continue;
    }
    if (HTML_TAG_ONLY_RE.test(trimmed)) {
      continue;
    }

    paragraph.push(trimmed);
  }

  return cleanSummaryText(paragraph.join(' '));
}

function normalizeReferenceDefinition(
  line: string,
  currentFilePath: string,
  baseUrl: string,
): string {
  const match = line.match(/^(\s*\[[^\]]+\]:\s*)(\S+)([\s\S]*)$/);
  if (!match) {
    return line;
  }
  const prefix = match[1];
  const destination = match[2];
  const rest = match[3] ?? '';
  const normalizedDestination = normalizeLinkDestination(destination, currentFilePath, baseUrl);
  return `${prefix}${normalizedDestination}${rest}`;
}

function normalizeLinkDestination(
  rawDestination: string,
  currentFilePath: string,
  baseUrl: string,
): string {
  const leading = rawDestination.match(/^\s*/)?.[0] ?? '';
  const trailing = rawDestination.match(/\s*$/)?.[0] ?? '';
  const inner = rawDestination.slice(leading.length, rawDestination.length - trailing.length);

  if (!inner) {
    return rawDestination;
  }

  if (inner.startsWith('<')) {
    const end = inner.indexOf('>');
    if (end !== -1) {
      const url = inner.slice(1, end);
      const rest = inner.slice(end + 1);
      const normalized = normalizeDocLink(url, currentFilePath, baseUrl);
      return `${leading}<${normalized}>${rest}${trailing}`;
    }
  }

  const match = inner.match(/^(\S+)([\s\S]*)$/);
  if (!match) {
    return rawDestination;
  }

  const url = match[1];
  const rest = match[2] ?? '';
  const normalized = normalizeDocLink(url, currentFilePath, baseUrl);
  return `${leading}${normalized}${rest}${trailing}`;
}

function normalizeDocLink(url: string, currentFilePath: string, baseUrl: string): string {
  if (!url || url.startsWith('#')) {
    return url;
  }
  if (url.startsWith('//') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
    return url;
  }

  let pathPart = url;
  let hash = '';
  let query = '';
  const hashIndex = pathPart.indexOf('#');
  if (hashIndex >= 0) {
    hash = pathPart.slice(hashIndex);
    pathPart = pathPart.slice(0, hashIndex);
  }
  const queryIndex = pathPart.indexOf('?');
  if (queryIndex >= 0) {
    query = pathPart.slice(queryIndex);
    pathPart = pathPart.slice(0, queryIndex);
  }

  let isRoot = false;
  if (pathPart.startsWith('/')) {
    isRoot = true;
    pathPart = pathPart.replace(/^\/docs\/5\.x\//, '');
    pathPart = pathPart.replace(/^\/+/, '');
  }

  if (!pathPart) {
    return url;
  }

  let resolvedPath = pathPart;
  if (!isRoot) {
    resolvedPath = path.posix.normalize(
      path.posix.join(path.posix.dirname(currentFilePath), pathPart),
    );
  }

  const mappedPath = mapDocPath(resolvedPath);
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${mappedPath.replace(/^\//, '')}${query}${hash}`;
}

function mapDocPath(docPath: string): string {
  const lowerPath = docPath.toLowerCase();
  if (lowerPath === 'readme.md' || lowerPath.endsWith('/readme.md')) {
    return path.posix.join(path.posix.dirname(docPath), 'index.html');
  }
  if (lowerPath === 'index.md' || lowerPath.endsWith('/index.md')) {
    return path.posix.join(path.posix.dirname(docPath), 'index.html');
  }
  if (lowerPath.endsWith('.md')) {
    return docPath.replace(/\.md$/i, '.html');
  }
  return docPath;
}

function cleanSummaryText(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  cleaned = cleaned.replace(/`([^`]*)`/g, '$1');
  cleaned = cleaned.replace(/^>+\s*/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

function resolveIncludePath(includePath: string, repoRoot: string, currentFilePath: string): string {
  let resolvedPath = '';
  if (includePath.startsWith('/')) {
    resolvedPath = path.join(repoRoot, includePath.replace(/^\/+/, ''));
  } else if (includePath.startsWith('.')) {
    resolvedPath = path.resolve(path.dirname(currentFilePath), includePath);
  } else {
    resolvedPath = path.join(repoRoot, includePath);
  }

  const normalizedRoot = path.resolve(repoRoot);
  const normalizedPath = path.resolve(resolvedPath);
  if (
    normalizedPath !== normalizedRoot &&
    !normalizedPath.startsWith(`${normalizedRoot}${path.sep}`)
  ) {
    throw new Error(`Include path escapes repo root: ${includePath}`);
  }

  return normalizedPath;
}

function stripHtmlComments(line: string): string {
  return line.replace(/<!--[\s\S]*?-->/g, '');
}

function replaceComponentTags(line: string): string {
  return line.replace(COMPONENT_TAG_RE, (match, tagName: string, attrPart: string = '') => {
    const isClosing = match.startsWith('</');
    const isSelfClosing = match.endsWith('/>');
    const lowerName = tagName.toLowerCase();

    if (STANDARD_HTML_TAGS.has(lowerName)) {
      return match;
    }

    if (DROP_COMPONENT_TAGS.has(lowerName)) {
      return '';
    }

    if (isClosing) {
      return '';
    }

    if (tagName.includes(':')) {
      return tagName;
    }

    const attrs = parseAttributes(attrPart);
    if (INLINE_COMPONENT_TAGS.has(lowerName) || isSelfClosing) {
      const text = componentText(tagName, attrs);
      return text || tagName;
    }

    if (Object.keys(attrs).length > 0) {
      return '';
    }

    if (/^[A-Z]/.test(tagName)) {
      return '';
    }

    return tagName;
  });
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /([A-Za-z0-9:_-]+)\s*=\s*"([^"]*)"/g;
  let match = regex.exec(raw);
  while (match) {
    attrs[match[1].toLowerCase()] = match[2];
    match = regex.exec(raw);
  }
  return attrs;
}

function componentText(tagName: string, attrs: Record<string, string>): string {
  const name = tagName.toLowerCase();
  if (name === 'since') {
    const ver = attrs.ver ?? attrs.version ?? '';
    const feature = attrs.feature ?? attrs.text ?? attrs.label ?? '';
    if (ver && feature) {
      return `Since ${ver}: ${feature}`;
    }
    if (ver) {
      return `Since ${ver}`;
    }
    if (feature) {
      return `Since: ${feature}`;
    }
    return 'Since';
  }
  if (name === 'badge') {
    return attrs.text ?? attrs.label ?? attrs.title ?? '';
  }
  if (name === 'todo') {
    const notes = attrs.notes ?? attrs.text ?? attrs.label ?? '';
    return notes ? `TODO: ${notes}` : 'TODO';
  }
  if (name === 'journey') {
    const pathValue = attrs.path ?? attrs.label ?? attrs.text ?? '';
    return pathValue ? `Journey: ${pathValue}` : 'Journey';
  }
  if (name === 'see') {
    const label = attrs.label ?? attrs.text ?? attrs.title ?? '';
    const description = attrs.description ?? attrs.desc ?? '';
    const target = attrs.path ?? attrs.url ?? '';
    const parts = [label, description, target].filter(Boolean);
    if (parts.length === 0) {
      return 'See';
    }
    return parts.join(' - ');
  }
  if (name === 'cloud') {
    return '';
  }
  return attrs.text ?? attrs.label ?? attrs.title ?? '';
}
