// Zips dist/ into store/tubestat-<version>.zip for the Chrome Web Store and
// GitHub releases. Run after `npm run build` (npm run package does both).
import { readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const { version } = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf8'));
const zip = resolve(root, 'store', `tubestat-${version}.zip`);
if (existsSync(zip)) rmSync(zip);

// manifest.json must sit at the zip's root, not inside a dist/ folder. bsdtar (built into
// Windows 10+ and macOS) writes standard forward-slash paths; PowerShell's Compress-Archive
// writes backslashes, which the Chrome Web Store can reject.
// On Windows, call System32's bsdtar by full path: Git for Windows puts GNU tar first on PATH.
const files = readdirSync(dist);
const out = relative(dist, zip);
if (process.platform === 'win32') {
  execFileSync(resolve(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-a', '-c', '-f', out, ...files], { cwd: dist, stdio: 'inherit' });
} else {
  execFileSync('zip', ['-qr', out, ...files], { cwd: dist, stdio: 'inherit' });
}
console.log(`packaged ${zip}`);
