// Vitest `--changed` provider: git's changed files, plus the tests that read files from disk.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const readsDisk =
    /from '(node:)?fs(\/promises)?'|require\('(node:)?fs|typescript-compiler-api|from 'typescript'|__dirname|process\.cwd\(\)|import\.meta\.(glob|url|dirname)/;

export default {
    async findChangedFiles(options) {
        // Vitest is installed per package, so resolve it from the package under test.
        const { GitVCSProvider } = await import(
            createRequire(path.join(options.root, 'package.json')).resolve(
                'vitest/node',
            )
        );
        const changed = await new GitVCSProvider().findChangedFiles(options);
        if (changed.length === 0) return changed;

        // No import links these tests to the files they read, so any change runs them.
        const diskReaders = fs
            .globSync('**/*.test.{ts,tsx}', {
                cwd: options.root,
                exclude: ['**/node_modules/**', '**/dist/**'],
            })
            .map((file) => path.join(options.root, file))
            .filter((file) => readsDisk.test(fs.readFileSync(file, 'utf8')));

        return [...changed, ...diskReaders];
    },
};
