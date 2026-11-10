/**
 * Captures what `lightdash download --charts <slug>` writes for a seeded
 * chart, into the fixtures the content-as-code lessons are checked against
 * (lessons.ts: a lesson's edit must find its `from` line there, and Use it
 * must turn the file into one Check accepts). Run it against a training copy
 * whenever the seeded charts or the CLI's YAML change, and commit the result.
 * A file is written only when it is a seeded chart exactly as the bundle
 * seeds it (slug and name), so pointing this at a real project by mistake
 * cannot put that project's content into the repository.
 *
 * Runs the CLI built in this checkout (`pnpm -F @lightdash/cli build`) with
 * a throwaway HOME, so it neither reads nor writes your CLI config. Use a
 * short-lived personal access token, and keep it out of your shell history:
 *
 *   read -rs LIGHTDASH_API_KEY && export LIGHTDASH_API_KEY
 *   LIGHTDASH_URL=http://localhost:3000 LIGHTDASH_PROJECT=<training copy uuid> \
 *   pnpm scope-tours:refresh-code-fixture revenue-by-payment-method [more slugs]
 */
import { execFileSync } from 'node:child_process';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bundleCharts, CODE_LESSON_FIXTURES } from './lessons';
import { root } from './lib';

/** The slugs the Learn terminal accepts (allowlist.ts): no path can hide in one. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const main = () => {
    const slugs = process.argv.slice(2);
    const missing = ['LIGHTDASH_URL', 'LIGHTDASH_API_KEY', 'LIGHTDASH_PROJECT']
        .filter((name) => !process.env[name])
        .join(', ');
    if (slugs.length === 0 || missing) {
        console.error(
            `Usage: LIGHTDASH_URL=… LIGHTDASH_PROJECT=<training copy> pnpm scope-tours:refresh-code-fixture <chart slug>… (LIGHTDASH_API_KEY exported)${
                missing ? `\nMissing: ${missing}` : ''
            }`,
        );
        process.exit(1);
    }
    const charts = bundleCharts();
    const unknown = slugs.filter(
        (slug) => !SLUG.test(slug) || !charts.has(slug),
    );
    if (unknown.length > 0) {
        console.error(`Not a seeded chart slug: ${unknown.join(', ')}`);
        process.exit(1);
    }
    const cli = path.join(root, 'packages/cli/dist/index.js');
    if (!existsSync(cli)) {
        console.error(`${cli} not found: run pnpm -F @lightdash/cli build`);
        process.exit(1);
    }
    const out = path.join(root, CODE_LESSON_FIXTURES);
    const work = mkdtempSync(path.join(tmpdir(), 'code-fixture-'));
    try {
        execFileSync(
            process.execPath,
            [cli, 'download', '--charts', ...slugs],
            {
                cwd: work,
                env: { ...process.env, HOME: work, CI: 'true' },
                stdio: 'inherit',
            },
        );
        mkdirSync(out, { recursive: true });
        for (const slug of slugs) {
            const written = path.join(work, 'lightdash/charts', `${slug}.yml`);
            if (!existsSync(written)) {
                throw new Error(`the download wrote no file for ${slug}`);
            }
            const content = readFileSync(written, 'utf8');
            const lines = content.split('\n');
            if (
                !lines.includes(`slug: ${slug}`) ||
                !lines.includes(`name: ${charts.get(slug)}`)
            ) {
                throw new Error(
                    `${slug}: the downloaded chart is not the seeded one (slug and name "${charts.get(slug)}"); is LIGHTDASH_PROJECT a fresh training copy?`,
                );
            }
            const target = path.join(out, `${slug}.yml`);
            if (path.dirname(target) !== out) {
                throw new Error(`${slug}: would be written outside ${out}`);
            }
            writeFileSync(target, content);
            console.log(`${CODE_LESSON_FIXTURES}/${slug}.yml`);
        }
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
};

main();
