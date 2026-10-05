import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
    chmodSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(new URL('./action.yml', import.meta.url), 'utf8');
const script = (id, contents = source) => {
    const step = contents.split(`id: ${id}\n`)[1];
    const match = step?.match(/^( +)run: \|\n/m);
    assert.ok(match, `Missing shell step ${id}`);
    const indent = match[1].length + 2;
    return step
        .slice(match.index + match[0].length)
        .split('\n')
        .filter((line, index, lines) => {
            const end = lines.findIndex(
                (value) =>
                    value.trim() && !value.startsWith(' '.repeat(indent)),
            );
            return end === -1 || index < end;
        })
        .map((line) => line.slice(indent))
        .join('\n');
};

const workflow = readFileSync(
    new URL('../scope-tours-check.yml', import.meta.url),
    'utf8',
);
// The real list from the scripts, as the workflow reads it.
const inputPaths = () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'walkthrough-inputs-'));
    try {
        const outputs = path.join(cwd, 'outputs');
        const listed = spawnSync(
            'bash',
            ['-e', '-o', 'pipefail', '-c', script('paths', workflow)],
            {
                cwd: fileURLToPath(new URL('../../..', import.meta.url)),
                env: { ...process.env, GITHUB_OUTPUT: outputs },
                encoding: 'utf8',
            },
        );
        assert.equal(listed.status, 0, listed.stderr);
        return readFileSync(outputs, 'utf8')
            .trim()
            .replace(/^paths=/, '');
    } finally {
        rmSync(cwd, { recursive: true, force: true });
    }
};

const artifacts = ['generated.ts', 'curriculum.ts'];
const withRepository = (callback) => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'walkthrough-ci-'));
    try {
        const output = path.join(
            cwd,
            'packages/frontend/src/features/scopeTours',
        );
        const bin = path.join(cwd, 'bin');
        mkdirSync(output, { recursive: true });
        mkdirSync(bin);
        artifacts.forEach((name) =>
            writeFileSync(path.join(output, name), `committed ${name}`),
        );
        execFileSync('git', ['init', '-q'], { cwd });
        execFileSync('git', ['add', 'packages'], { cwd });
        execFileSync(
            'git',
            [
                '-c',
                'user.name=Test',
                '-c',
                'user.email=test@example.com',
                'commit',
                '-qm',
                'fixture',
            ],
            { cwd },
        );
        writeFileSync(
            path.join(bin, 'pnpm'),
            `#!/bin/bash
set -eu
output=packages/frontend/src/features/scopeTours
case "$1" in
  scope-tours:generate) echo fresh > "$output/generated.ts" ;;
  scope-tours:order) echo fresh > "$output/curriculum.ts" ;;
esac
if [ "$1" = "\${FAIL_COMMAND:-}" ]; then exit 1; fi
`,
        );
        chmodSync(path.join(bin, 'pnpm'), 0o755);
        const env = {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            GITHUB_OUTPUT: path.join(cwd, 'outputs'),
            GITHUB_STEP_SUMMARY: path.join(cwd, 'summary'),
            DOCS_SHA: 'fixture-sha',
        };
        const run = (id, extra = {}, contents = source) =>
            spawnSync(
                'bash',
                [
                    '--noprofile',
                    '--norc',
                    '-e',
                    '-o',
                    'pipefail',
                    '-c',
                    script(id, contents),
                ],
                { cwd, env: { ...env, ...extra }, encoding: 'utf8' },
            );
        callback({ output, run, cwd });
    } finally {
        rmSync(cwd, { recursive: true, force: true });
    }
};

test('successful refresh keeps both generated files', () => {
    withRepository(({ output, run }) => {
        assert.equal(run('generate').status, 0);
        artifacts.forEach((name) =>
            assert.equal(
                readFileSync(path.join(output, name), 'utf8'),
                'fresh\n',
            ),
        );
    });
});

for (const command of [
    'scope-tours:generate',
    'scope-tours:order',
    'scope-tours:check',
]) {
    test(`${command} failure restores both files and warns`, () => {
        withRepository(({ output, run, cwd }) => {
            assert.equal(run('generate', { FAIL_COMMAND: command }).status, 1);
            const restored = run('restore');
            assert.equal(restored.status, 0, restored.stderr);
            assert.match(restored.stdout, /::warning/);
            assert.match(
                readFileSync(path.join(cwd, 'summary'), 'utf8'),
                /fixture-sha/,
            );
            artifacts.forEach((name) =>
                assert.equal(
                    readFileSync(path.join(output, name), 'utf8'),
                    `committed ${name}`,
                ),
            );
        });
    });
}

test('docs checkout failure also preserves committed files', () => {
    withRepository(({ output, run }) => {
        assert.equal(run('restore', { DOCS_SHA: '' }).status, 0);
        artifacts.forEach((name) =>
            assert.equal(
                readFileSync(path.join(output, name), 'utf8'),
                `committed ${name}`,
            ),
        );
    });
});

test('coverage is still enforced after falling back', () => {
    withRepository(({ run }) => {
        assert.equal(run('restore').status, 0);
        assert.equal(
            run('coverage', { FAIL_COMMAND: 'scope-tours:release-check' })
                .status,
            1,
        );
    });
});

test('strict walkthrough validation fails after a docs refresh failure', () => {
    withRepository(({ run }) => assert.equal(run('enforce').status, 1));
});

test('the scripts list the walkthrough inputs', () => {
    const paths = inputPaths().split(' ');
    assert.ok(paths.includes('scripts/scope-tours'));
    assert.ok(paths.includes('packages/frontend/src/Routes.tsx'));
});

for (const [file, content, strict] of [
    ['packages/frontend/src/Example.tsx', '<Box data-tour-step="1" />', true],
    ['packages/frontend/src/Routes.tsx', 'export const routes = [];', true],
    ['scripts/scope-tours/lib.ts', 'export const buildTours = () => [];', true],
    ['packages/frontend/src/Example.tsx', '<Box color="blue" />', false],
]) {
    test(`input detection ${strict ? 'validates' : 'skips'} ${file}`, () => {
        withRepository(({ cwd, run }) => {
            const base = execFileSync('git', ['rev-parse', 'HEAD'], {
                cwd,
                encoding: 'utf8',
            }).trim();
            mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
            writeFileSync(path.join(cwd, file), content);
            execFileSync('git', ['add', file], { cwd });
            execFileSync(
                'git',
                [
                    '-c',
                    'user.name=Test',
                    '-c',
                    'user.email=test@example.com',
                    'commit',
                    '-qm',
                    'change',
                ],
                { cwd },
            );
            const result = run(
                'inputs',
                {
                    BASE_SHA: base,
                    HEAD_SHA: 'HEAD',
                    RUNNER_TEMP: cwd,
                    INPUT_PATHS: inputPaths(),
                },
                workflow,
            );
            assert.equal(result.status, 0, result.stderr);
            assert.equal(
                readFileSync(path.join(cwd, 'outputs'), 'utf8'),
                `strict=${strict}\n`,
            );
        });
    });
}

test('walkthrough changes on main do not make an unrelated PR strict', () => {
    withRepository(({ cwd, run }) => {
        const base = execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd,
            encoding: 'utf8',
        }).trim();
        writeFileSync(path.join(cwd, 'unrelated.txt'), 'PR change');
        execFileSync('git', ['add', 'unrelated.txt'], { cwd });
        execFileSync(
            'git',
            [
                '-c',
                'user.name=Test',
                '-c',
                'user.email=test@example.com',
                'commit',
                '-qm',
                'PR',
            ],
            { cwd },
        );
        const head = execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd,
            encoding: 'utf8',
        }).trim();
        execFileSync('git', ['checkout', '-qb', 'updated-main', base], { cwd });
        const file = 'packages/frontend/src/Routes.tsx';
        writeFileSync(path.join(cwd, file), 'new route on main');
        execFileSync('git', ['add', file], { cwd });
        execFileSync(
            'git',
            [
                '-c',
                'user.name=Test',
                '-c',
                'user.email=test@example.com',
                'commit',
                '-qm',
                'main',
            ],
            { cwd },
        );
        const result = run(
            'inputs',
            {
                BASE_SHA: 'HEAD',
                HEAD_SHA: head,
                RUNNER_TEMP: cwd,
                INPUT_PATHS: inputPaths(),
            },
            workflow,
        );
        assert.equal(result.status, 0, result.stderr);
        assert.equal(
            readFileSync(path.join(cwd, 'outputs'), 'utf8'),
            'strict=false\n',
        );
    });
});

for (const removed of [false, true]) {
    test(`multiline marker ${removed ? 'removal' : 'value edit'} requires validation`, () => {
        withRepository(({ cwd, run }) => {
            const git = (...args) =>
                execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
            const file = 'packages/frontend/src/Example.tsx';
            writeFileSync(
                path.join(cwd, file),
                "const props = {\n  'data-tour-docs':\n    'spaces.mdx#intro:1',\n};\n",
            );
            git('add', file);
            git(
                '-c',
                'user.name=Test',
                '-c',
                'user.email=test@example.com',
                'commit',
                '-qm',
                'marker',
            );
            const base = git('rev-parse', 'HEAD');
            writeFileSync(
                path.join(cwd, file),
                removed
                    ? 'const props = {};\n'
                    : "const props = {\n  'data-tour-docs':\n    'spaces.mdx#missing:1',\n};\n",
            );
            git('add', file);
            git(
                '-c',
                'user.name=Test',
                '-c',
                'user.email=test@example.com',
                'commit',
                '-qm',
                'edit',
            );
            const result = run(
                'inputs',
                {
                    BASE_SHA: base,
                    HEAD_SHA: 'HEAD',
                    RUNNER_TEMP: cwd,
                    INPUT_PATHS: inputPaths(),
                },
                workflow,
            );
            assert.equal(result.status, 0, result.stderr);
            assert.equal(
                readFileSync(path.join(cwd, 'outputs'), 'utf8'),
                'strict=true\n',
            );
        });
    });
}
