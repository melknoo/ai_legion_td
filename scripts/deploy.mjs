// Runs deploy-home.sh with a bash that sees the user's SSH setup. On Windows a plain `bash`
// is often WSL's, which has its own ~/.ssh without the `legion-home` alias; Git Bash uses
// Windows OpenSSH and its config instead.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function gitBash() {
  // git --exec-path: <git root>/mingw64/libexec/git-core
  const execPath = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim();
  const bash = path.join(execPath, '..', '..', '..', 'bin', 'bash.exe');
  if (!fs.existsSync(bash)) throw new Error(`Git Bash not found at ${bash}`);
  return bash;
}

const bash = process.platform === 'win32' ? gitBash() : 'bash';
const script = path.join(import.meta.dirname, 'deploy-home.sh');
const { status } = spawnSync(bash, [script], { stdio: 'inherit' });
process.exit(status ?? 1);
