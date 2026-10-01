/**
 * Regenerates the walkthrough artifacts for CI and releases. When a command
 * fails (usually a docs edit that broke a citation), the committed artifacts
 * are restored and a warning is printed, so the build or release continues
 * with the last released walkthroughs.
 *
 * Usage: node scripts/scope-tours/prepare-artifacts.mjs [--validate]
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..',
);
const ARTIFACTS = ['generated.ts', 'curriculum.ts'].map((name) =>
    path.join(ROOT, 'packages/frontend/src/features/scopeTours', name),
);
const GENERATE = ['pnpm scope-tours:generate', 'pnpm scope-tours:order'];
const VALIDATE = ['pnpm scope-tours:check', 'pnpm scope-tours:release-check'];

export const prepareArtifacts = ({ artifacts, commands, run, warn }) => {
    const committed = artifacts.map((artifact) => readFileSync(artifact));
    const failed = commands.find((command) => {
        try {
            run(command);
            return false;
        } catch {
            return true;
        }
    });
    if (failed === undefined) return true;

    artifacts.forEach((artifact, index) =>
        writeFileSync(artifact, committed[index]),
    );
    warn(
        `\`${failed}\` failed; using the committed generated.ts and curriculum.ts. See docs/learn/maintaining-walkthroughs.md.`,
    );
    return false;
};

if (
    process.argv[1] &&
    fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
    prepareArtifacts({
        artifacts: ARTIFACTS,
        commands: process.argv.includes('--validate')
            ? [...GENERATE, ...VALIDATE]
            : GENERATE,
        run: (command) => execSync(command, { cwd: ROOT, stdio: 'inherit' }),
        warn: (message) =>
            console.log(
                `::warning title=Walkthrough artifacts were not regenerated::${message}`,
            ),
    });
}
