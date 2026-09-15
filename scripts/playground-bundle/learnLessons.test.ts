/**
 * Every developer lesson's snippet, appended to its file the way the editor
 * appends it, must compile against the learn bundle and produce the field
 * the tour ends on. Runs the local dbt adapter over a materialised workspace
 * (the same path the sandbox takes), so it needs the playground venv
 * (scripts/playground-bundle/README.md) and the built common package.
 * Run with `pnpm test:learn-lessons`.
 */
import {
    findFieldByIdInExplore,
    isExploreError,
    SupportedDbtVersions,
} from '@lightdash/common';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DbtLocalProjectAdapter } from '../../packages/backend/src/projectAdapters/dbtLocalProjectAdapter';
import { resolveSandboxRuntime } from '../../packages/backend/src/services/LearnSandboxService/runtime';
import {
    loadLearnBundle,
    materialiseWorkspace,
} from '../../packages/backend/src/services/LearnSandboxService/workspace';
import { SANDBOX_LESSONS } from '../../packages/frontend/src/features/learn/sandboxLessons';
import { getCatalog } from './compile';

const venvBin = path.join(__dirname, '.venv/bin');

/** The editor's append: a newline first unless the file already ends in one. */
const appendSnippet = (content: string, snippet: string) =>
    `${content}${
        content.length === 0 || content.endsWith('\n') ? '' : '\n'
    }${snippet}`;

const checkLesson = async (
    lesson: (typeof SANDBOX_LESSONS)[number],
    bundle: Awaited<ReturnType<typeof loadLearnBundle>>,
    databasePath: string,
) => {
    const file = bundle.files.find((f) => f.path === lesson.file);
    assert.ok(file, `${lesson.id}: ${lesson.file} is not in the learn bundle`);
    assert.ok(
        !file.content.includes(`${lesson.result.field}:`),
        `${lesson.id}: ${lesson.result.field} already exists in ${lesson.file}, the lesson would teach nothing`,
    );

    const fieldId = `${lesson.result.explore}_${lesson.result.field}`;
    const workspaceDir = await mkdtemp(path.join(tmpdir(), 'learn-lesson-'));
    await materialiseWorkspace({
        bundle,
        overlay: [
            {
                path: lesson.file,
                content: appendSnippet(file.content, lesson.snippet),
            },
        ],
        workspaceDir,
        profiles: { databasePath },
    });
    const adapter = new DbtLocalProjectAdapter({
        warehouseClient: new DuckdbWarehouseClient(),
        projectDir: path.join(workspaceDir, 'project'),
        profilesDir: workspaceDir,
        target: 'jaffle',
        profileName: 'jaffle_shop',
        cachedWarehouse: {
            warehouseCatalog: undefined,
            onWarehouseCatalogChange: () => {},
        },
        environmentVariableAllowlist: [],
        dbtVersion: SupportedDbtVersions.V1_10,
    });
    try {
        adapter.cachedWarehouse.warehouseCatalog =
            await getCatalog(databasePath);
        const explores = await adapter.compileAllExplores();
        const explore = explores.find((e) => e.name === lesson.result.explore);
        assert.ok(
            explore,
            `${lesson.id}: explore ${lesson.result.explore} is not in the compiled project`,
        );
        assert.ok(
            !isExploreError(explore),
            `${lesson.id}: explore ${lesson.result.explore} did not compile: ${
                isExploreError(explore) ? JSON.stringify(explore.errors) : ''
            }`,
        );
        const field = findFieldByIdInExplore(explore, fieldId);
        assert.ok(
            field,
            `${lesson.id}: ${fieldId} is missing after appending the snippet`,
        );
        console.log(
            `learn-lessons: ${lesson.id} -> ${fieldId} (${field.type})`,
        );
    } finally {
        await adapter.destroy();
        await rm(workspaceDir, { recursive: true, force: true });
    }
};

const main = async () => {
    const previousPath = process.env.PATH;
    process.env.PATH = `${venvBin}:${previousPath ?? ''}`;
    try {
        const bundle = await loadLearnBundle();
        const { databasePath } = resolveSandboxRuntime();
        for (const lesson of SANDBOX_LESSONS) {
            // eslint-disable-next-line no-await-in-loop
            await checkLesson(lesson, bundle, databasePath);
        }
    } finally {
        process.env.PATH = previousPath;
    }
    console.log('learn-lessons: all snippets compile');
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
