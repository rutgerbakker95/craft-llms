import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const execFileAsync = promisify(execFile);

export async function runGit(args: string[], cwd?: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd });
    return stdout.toString();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`git ${args.join(' ')} failed: ${message}`);
  }
}

export async function ensureDocsRepo(repoDir: string, repoUrl: string): Promise<void> {
  if (!fs.existsSync(repoDir)) {
    await runGit(['clone', '--depth', '1', repoUrl, repoDir]);
    return;
  }

  const gitDir = path.join(repoDir, '.git');
  if (!fs.existsSync(gitDir)) {
    throw new Error(`Docs repo path exists but is not a git repo: ${repoDir}`);
  }

  await runGit(['-C', repoDir, 'pull', '--ff-only']);
}

export async function getRepoMeta(repoDir: string): Promise<{ commit: string; timestamp: string }> {
  const commit = (await runGit(['-C', repoDir, 'rev-parse', '--short', 'HEAD'])).trim();
  const timestamp = (await runGit(['-C', repoDir, 'log', '-1', '--format=%cI'])).trim();
  return { commit, timestamp };
}
