import path from 'node:path';

type FenceState = {
  inFence: boolean;
  fenceMarker: '```' | '~~~' | '';
};

const INLINE_LINK_RE = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g;
const HEADING_RE = /^#{1,6}\s+/;
const LIST_RE = /^\s*([-*+]|\d+\.)\s+/;

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

export function stripVuePressDirectives(content: string): string {
  const lines = content.split('\n');
  let state: FenceState = { inFence: false, fenceMarker: '' };
  const output: string[] = [];

  for (const line of lines) {
    state = updateFenceState(line, state);
    if (!state.inFence && line.trim().startsWith(':::')) {
      continue;
    }
    output.push(line);
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
  cleaned = cleaned.replace(/`([^`]*)`/g, '$1');
  cleaned = cleaned.replace(/^>+\s*/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}
