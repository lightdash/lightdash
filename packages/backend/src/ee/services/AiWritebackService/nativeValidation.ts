import {
    compileLightdashModels,
    DEFAULT_SPOTLIGHT_CONFIG,
    isExploreError,
    loadLightdashProjectConfig,
    loadProjectContextFile,
    ParseError,
    type WarehouseTypes,
} from '@lightdash/common';
import { loadLightdashModels } from '@lightdash/common/lightdash/loader';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { preAggregatePostProcessor } from '../../preAggregates/postProcessor';
import type { SandboxHandle } from '../SandboxRuntime';
import { CWD } from './constants';

const SNAPSHOT_SCRIPT = '/home/user/.ld-native-snapshot.cjs';
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 10000;

// Only native source is transferred, never credentials or arbitrary repo files.
// Real paths are checked before reading, and no repository code is executed.
export const buildNativeSnapshotScript = (projectSubPath: string): string => `
const fs = require('fs');
const path = require('path');
const repo = fs.realpathSync(process.cwd());
const root = fs.realpathSync(path.resolve(repo, ${JSON.stringify(projectSubPath)}));
const within = (base, file) => {
    const relative = path.relative(base, fs.realpathSync(file));
    if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative))
        throw new Error('Native source must stay inside the connected project');
};
within(repo, root);
const files = {};
let bytes = 0;
const read = (file) => {
    within(root, file);
    bytes += fs.statSync(file).size;
    if (bytes > ${MAX_BYTES} || Object.keys(files).length >= ${MAX_FILES})
        throw new Error('Native source exceeds write-back validation limits');
    files[path.relative(root, file)] = fs.readFileSync(file, 'utf8');
};
const walk = (dir) => {
    within(root, dir);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (entry.isFile() && /\\.ya?ml$/.test(entry.name)) read(file);
    }
};
for (const dir of ['models', 'lightdash/models']) {
    const file = path.join(root, dir);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) { walk(file); break; }
}
for (const name of ['lightdash.config.yml', 'lightdash.project_context.yml']) {
    const file = path.join(root, name);
    if (fs.existsSync(file)) read(file);
}
process.stdout.write(JSON.stringify(files));
`;

/** Validate the exact edited source with the server/CLI compiler before any PR mutation. */
export async function validateNativeSandbox({
    sandbox,
    projectSubPath,
    warehouseType,
}: {
    sandbox: SandboxHandle;
    projectSubPath: string;
    warehouseType: WarehouseTypes | null;
}): Promise<void> {
    if (!warehouseType)
        throw new ParseError('Native write-back requires a warehouse type');
    await sandbox.files.write(
        SNAPSHOT_SCRIPT,
        buildNativeSnapshotScript(projectSubPath),
    );
    const result = await sandbox.commands.run(`node ${SNAPSHOT_SCRIPT}`, {
        cwd: CWD,
        timeoutMs: 60000,
    });
    if (result.exitCode !== 0)
        throw new ParseError('Could not read native source for validation');
    if (Buffer.byteLength(result.stdout) > MAX_BYTES * 2)
        throw new ParseError(
            'Native source exceeds write-back validation limits',
        );
    const files: unknown = JSON.parse(result.stdout);
    if (!files || typeof files !== 'object' || Array.isArray(files))
        throw new ParseError('Invalid native source snapshot');
    const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'native-writeback-'),
    );
    try {
        for await (const [name, contents] of Object.entries(files)) {
            if (
                typeof contents !== 'string' ||
                name.split('/').includes('..') ||
                name.includes('\\') ||
                !/^(?:(?:lightdash\/)?models\/.+\.ya?ml|lightdash\.(?:config|project_context)\.yml)$/.test(
                    name,
                )
            )
                throw new ParseError('Invalid native source path');
            const target = path.join(directory, name);
            await fs.mkdir(path.dirname(target), { recursive: true });
            await fs.writeFile(target, contents);
        }
        const models = await loadLightdashModels(directory);
        if (models.length === 0)
            throw new ParseError('No native Lightdash models found');
        const config =
            'lightdash.config.yml' in files
                ? await loadLightdashProjectConfig(
                      String(files['lightdash.config.yml']),
                  )
                : { spotlight: DEFAULT_SPOTLIGHT_CONFIG };
        if ('lightdash.project_context.yml' in files)
            await loadProjectContextFile(
                String(files['lightdash.project_context.yml']),
            );
        const explores = await compileLightdashModels({
            models,
            warehouseSqlBuilder: warehouseSqlBuilderFromType(warehouseType),
            lightdashProjectConfig: config,
            allowPartialCompilation: false,
            postProcessors: [preAggregatePostProcessor],
        });
        const failures = explores.filter(isExploreError);
        if (failures.length)
            throw new ParseError(
                `Native YAML compilation failed: ${failures.map((explore) => `${explore.name}: ${explore.errors.map((error) => error.message).join('; ')}`).join('\n')}`,
            );
    } finally {
        await fs.rm(directory, { recursive: true, force: true });
    }
}
