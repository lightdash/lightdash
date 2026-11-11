/**
 * Move the docs pin (docs-pin.txt) to a new docs commit and regenerate the
 * walkthroughs from it.
 *
 * CI generates the walkthroughs from the pinned docs commit, so a docs edit
 * reaches them only through a bump. A bump:
 *
 *   1. reads the target commit: --sha <sha>, else the head of the docs
 *      default branch (git ls-remote);
 *   2. writes it to docs-pin.txt;
 *   3. checks the docs checkout (LIGHTDASH_DOCS_DIR, else ../mintlify-docs)
 *      out at that commit, detached; a checkout with local changes is left
 *      alone and the bump stops;
 *   4. runs pnpm scope-tours:generate and pnpm scope-tours:order, then prints
 *      the diff of the pin and the generated files.
 *
 * Read the diff before you commit it. A citation move (a `data-tour-docs`
 * change, for example a `:pN` paragraph index) is not part of a bump: it goes
 * in a separate pull request (docs/learn/maintaining-walkthroughs.md).
 *
 * Usage: pnpm scope-tours:bump-docs [-- --sha <sha>] [--dry-run]
 *   --sha <sha>  pin this docs commit instead of the default branch head
 *   --dry-run    print the current pin and the target commit; change nothing
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
    docsDir,
    docsHead,
    docsPinPath,
    parseDocsPin,
    readDocsPin,
    root,
} from './lib';

const DOCS_REMOTE = 'https://github.com/lightdash/mintlify-docs';

const GENERATED = [
    path.relative(root, docsPinPath),
    'packages/frontend/src/features/scopeTours/generated.ts',
    'packages/frontend/src/features/scopeTours/released.ts',
    'packages/frontend/src/features/scopeTours/curriculum.ts',
];

const git = (
    args: string[],
    cwd = root,
    stderr: 'inherit' | 'ignore' = 'inherit',
) =>
    execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', stderr],
    }).trim();

const argValue = (name: string): string | undefined => {
    const index = process.argv.indexOf(name);
    return index === -1 ? undefined : process.argv[index + 1];
};

const defaultBranchHead = (): string =>
    parseDocsPin(
        git(['ls-remote', DOCS_REMOTE, 'HEAD']).split(/\s/)[0],
        `git ls-remote ${DOCS_REMOTE} HEAD`,
    );

const main = () => {
    const current = readDocsPin();
    const given = argValue('--sha');
    const sha =
        given === undefined
            ? defaultBranchHead()
            : parseDocsPin(given, '--sha');
    console.log(`Current pin: ${current}`);
    console.log(`Target:      ${sha}`);
    if (process.argv.includes('--dry-run')) {
        console.log(
            sha === current ? 'Already pinned.' : 'Dry run: nothing changed.',
        );
        return;
    }

    if (docsHead() === undefined) {
        throw new Error(
            `${docsDir} is not a git checkout of the docs. Clone ${DOCS_REMOTE} there (or set LIGHTDASH_DOCS_DIR), check out ${sha} and run this again.`,
        );
    }
    if (git(['status', '--porcelain'], docsDir) !== '') {
        throw new Error(
            `${docsDir} has local changes. Commit or stash them, then run this again.`,
        );
    }
    try {
        git(['cat-file', '-e', `${sha}^{commit}`], docsDir, 'ignore');
    } catch {
        git(['fetch', '--quiet', 'origin', sha], docsDir);
    }
    git(['checkout', '--quiet', '--detach', sha], docsDir);

    writeFileSync(docsPinPath, `${sha}\n`);
    console.log(`Wrote ${path.relative(root, docsPinPath)}`);

    for (const script of ['scope-tours:generate', 'scope-tours:order']) {
        execFileSync('pnpm', [script], { cwd: root, stdio: 'inherit' });
    }
    const stat = git(['diff', '--stat', '--', ...GENERATED]);
    if (stat === '') {
        console.log('No change to the pin or the generated files.');
        return;
    }
    console.log(stat);
    console.log(git(['diff', '--', ...GENERATED]));
    console.log(
        'Read the diff, run pnpm scope-tours:check, then commit the pin and the generated files together.',
    );
};

main();
