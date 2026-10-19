import { execFileSync } from 'child_process';

// Process tests spawn the compiled CLI, so dist must reflect src before any test file runs.
export default function setup() {
    execFileSync('pnpm', ['run', 'build'], {
        cwd: __dirname,
        stdio: 'inherit',
    });
}
