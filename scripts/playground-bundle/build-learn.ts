import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectLearnBundle, serializeLearnBundle } from './learnBundle';
import { replaceTableMaterializations } from './projectYaml';

const root = path.resolve(__dirname, '../..');
export const learnOutputDir = path.join(root, 'packages/backend/assets/learn');
export const learnBundlePath = path.join(learnOutputDir, 'jaffle-dbt.json');
export const learnChecksumsPath = path.join(learnOutputDir, 'SHA256SUMS');
const sourceDbtProjectDir = path.join(
    root,
    'examples/full-jaffle-shop-demo/dbt',
);

/**
 * Copies a dbt project directory (skipping any `target` directory segment)
 * and rewrites its `dbt_project.yml` materializations to `view`, so the copy
 * is ready to feed into `collectLearnBundle` or a `dbt run`.
 */
export const prepareDbtProjectCopy = async (
    sourceDir: string,
    destinationDir: string,
): Promise<void> => {
    await cp(sourceDir, destinationDir, {
        recursive: true,
        filter: (source) => !source.split(path.sep).includes('target'),
    });
    const projectFile = path.join(destinationDir, 'dbt_project.yml');
    await writeFile(
        projectFile,
        replaceTableMaterializations(await readFile(projectFile, 'utf8')),
    );
};

/**
 * Writes the learn bundle from a prepared dbt project directory (one whose
 * dbt_project.yml already has view materializations). Returns the bundle size.
 */
export const writeLearnBundle = async (
    preparedProjectDir: string,
): Promise<number> => {
    await mkdir(learnOutputDir, { recursive: true });
    const bundle = await collectLearnBundle(preparedProjectDir);
    const json = serializeLearnBundle(bundle);
    await writeFile(learnBundlePath, json);
    const sha = createHash('sha256').update(json).digest('hex');
    await writeFile(learnChecksumsPath, `${sha}  jaffle-dbt.json\n`);
    return bundle.files.length;
};

/** Standalone entry point: prepares a temp copy itself, no dbt run required. */
const main = async () => {
    const tempRoot = await mkdtemp(
        path.join(tmpdir(), 'lightdash-learn-bundle-'),
    );
    const projectDir = path.join(tempRoot, 'dbt');
    try {
        await prepareDbtProjectCopy(sourceDbtProjectDir, projectDir);
        const count = await writeLearnBundle(projectDir);
        console.log(`Built learn bundle: ${count} files`);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
};

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
