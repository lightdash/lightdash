import type { DbtManifest } from '@lightdash/common';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { getDbtProjectName, loadManifest } from './manifest';

let projectDir: string;
let targetDir: string;
beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(tmpdir(), 'dbt-project-identity-'));
    targetDir = path.join(projectDir, 'supplied_target');
    await fs.mkdir(targetDir);
});
afterEach(async () => fs.rm(projectDir, { recursive: true, force: true }));

it.each([
    { manifestName: 'project_a', fallback: 'project_b', expected: 'project_a' },
    { manifestName: 'project_a', fallback: undefined, expected: 'project_a' },
    { manifestName: undefined, fallback: 'project_a', expected: 'project_a' },
    { manifestName: ' ', fallback: 'project_a', expected: 'project_a' },
    { manifestName: undefined, fallback: undefined, expected: undefined },
])(
    'reads identity from the supplied manifest without local YAML (%j)',
    async ({ manifestName, fallback, expected }) => {
        await fs.writeFile(
            path.join(targetDir, 'manifest.json'),
            JSON.stringify({ metadata: { project_name: manifestName } }),
        );

        const manifest: DbtManifest = await loadManifest({ targetDir });

        expect(getDbtProjectName(manifest, fallback)).toBe(expected);
        await expect(
            fs.access(path.join(projectDir, 'dbt_project.yml')),
        ).rejects.toThrow();
    },
);
