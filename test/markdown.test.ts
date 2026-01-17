import test from 'node:test';
import assert from 'node:assert/strict';
import { docPathToUrl, extractTitle, stripFrontmatter } from '../src/markdown.js';

test('docPathToUrl maps markdown to html', () => {
  const baseUrl = 'https://craftcms.com/docs/5.x/';
  assert.equal(
    docPathToUrl('system/updates.md', baseUrl),
    'https://craftcms.com/docs/5.x/system/updates.html',
  );
  assert.equal(
    docPathToUrl('guides/README.md', baseUrl),
    'https://craftcms.com/docs/5.x/guides/index.html',
  );
  assert.equal(docPathToUrl('index.md', baseUrl), 'https://craftcms.com/docs/5.x/index.html');
});

test('extractTitle returns first H1', () => {
  const input = ['---', 'title: Ignored', '---', '', '# Real Title', '', 'Content'].join('\n');
  const stripped = stripFrontmatter(input);
  assert.equal(extractTitle(stripped, 'fallback'), 'Real Title');
});

test('stripFrontmatter removes yaml block', () => {
  const input = ['---', 'title: Example', 'description: Test', '---', '', 'Body'].join('\n');
  const output = stripFrontmatter(input);
  assert.equal(output.trim(), 'Body');
});
