/**
 * Move the docs pin (docs-pin.txt) to a new docs commit and regenerate the
 * walkthroughs from it.
 *
 * CI generates the walkthroughs from the pinned docs commit, so a docs edit
 * reaches them only through a bump. A bump:
 *
 *   1. reads the target commit: --sha <sha>, else the head of the docs
 *      default branch (git ls-remote);
 *   2. stops when the generated files have local changes in this repository;
 *   3. refuses a commit that is not on the docs origin/main, and warns when
 *      the pin moves backwards or sideways;
 *   4. checks the docs checkout (LIGHTDASH_DOCS_DIR, else ../mintlify-docs)
 *      out at that commit, detached; a checkout with local changes is left
 *      alone and the bump stops;
 *   5. writes the commit to docs-pin.txt;
 *   6. runs pnpm scope-tours:generate, pnpm scope-tours:order and
 *      pnpm scope-tours:check, then prints the diff stat, a table of every
 *      step whose title or body changed, and the full diff of the pin and the
 *      generated files.
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
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
    docsDir,
    docsHead,
    docsPinPath,
    GENERATED_FILES,
    generatedChangesError,
    outputPath,
    parseDocsPin,
    readDocsPin,
    root,
} from './lib';

const DOCS_REMOTE = 'https://github.com/lightdash/mintlify-docs';

const GENERATED = [path.relative(root, docsPinPath), ...GENERATED_FILES];

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

const isAncestor = (ancestor: string, descendant: string): boolean => {
    try {
        git(
            ['merge-base', '--is-ancestor', ancestor, descendant],
            docsDir,
            'ignore',
        );
        return true;
    } catch {
        return false;
    }
};

type Step = { title: string; body: string };

/** Title and body of every step in generated.ts, keyed by scope and position. generated.ts has one fixed shape: a scope key at four spaces, a step's title and body at sixteen, a long string wrapped onto the next line. */
const readSteps = (text: string): Map<string, Step> => {
    const steps = new Map<string, Step>();
    const lines = text.split('\n');
    let scope = '';
    let position = 0;
    let current: Step | undefined;
    for (let i = 0; i < lines.length; i += 1) {
        const scopeMatch = /^ {4}'([^']+)': \{$/.exec(lines[i]);
        if (scopeMatch) {
            [, scope] = scopeMatch;
            position = 0;
        } else {
            const field = /^ {16}(title|body):(?: (.*))?$/.exec(lines[i]);
            if (field && scope) {
                const value = (field[2] ?? lines[(i += 1)].trim()).replace(
                    /,$/,
                    '',
                );
                if (field[1] === 'title') {
                    position += 1;
                    current = { title: value, body: '' };
                    steps.set(`${scope} step ${position}`, current);
                } else if (current) {
                    current.body = value;
                }
            }
        }
    }
    return steps;
};

const changedStepsTable = (before: string, after: string): string => {
    const oldSteps = readSteps(before);
    const newSteps = readSteps(after);
    const rows: string[] = [];
    [...new Set([...oldSteps.keys(), ...newSteps.keys()])].forEach((key) => {
        const was = oldSteps.get(key);
        const now = newSteps.get(key);
        if (was?.title !== now?.title || was?.body !== now?.body) {
            const cell = (value: string | undefined) =>
                (value ?? '(none)').replace(/\|/g, '\\|');
            rows.push(
                `| ${key} | ${cell(now?.title ?? was?.title)} | ${cell(was?.body)} | ${cell(now?.body)} |`,
            );
        }
    });
    if (rows.length === 0) return 'No step title or body changed.';
    return [
        '| Scope and step | Title | Old body | New body |',
        '| --- | --- | --- | --- |',
        ...rows,
    ].join('\n');
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

    const generatedChanges = generatedChangesError(
        git(['status', '--porcelain', '--', ...GENERATED_FILES]),
    );
    if (generatedChanges !== undefined) throw new Error(generatedChanges);
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
    git(['fetch', '--quiet', 'origin', 'main'], docsDir);
    if (!isAncestor(sha, 'origin/main')) {
        throw new Error(
            `${sha} is not on the docs origin/main. Pin a commit that has been merged there (a docs branch commit can disappear after a squash merge, and CI could then not check it out).`,
        );
    }
    if (sha !== current && !isAncestor(current, sha)) {
        console.warn(
            `warning: ${sha} does not come after the current pin ${current}; this moves the pin backwards or sideways (or the current pin is not in the docs history here).`,
        );
    }
    git(['checkout', '--quiet', '--detach', sha], docsDir);

    const before = readFileSync(outputPath, 'utf8');
    writeFileSync(docsPinPath, `${sha}\n`);
    console.log(`Wrote ${path.relative(root, docsPinPath)}`);

    for (const script of ['scope-tours:generate', 'scope-tours:order']) {
        execFileSync('pnpm', [script], { cwd: root, stdio: 'inherit' });
    }
    try {
        execFileSync('pnpm', ['scope-tours:check'], {
            cwd: root,
            stdio: 'inherit',
        });
    } catch (error) {
        console.error(
            'scope-tours:check failed: the pin and the generated files are changed in your working tree; fix the cause or restore them with git checkout.',
        );
        throw error;
    }
    const stat = git(['diff', '--stat', '--', ...GENERATED]);
    if (stat === '') {
        console.log('No change to the pin or the generated files.');
        return;
    }
    console.log(stat);
    console.log(changedStepsTable(before, readFileSync(outputPath, 'utf8')));
    console.log(git(['diff', '--', ...GENERATED]));
    console.log(
        'scope-tours:check passed. Read the changed steps and the diff, then commit the pin and the generated files together.',
    );
};

main();
