import { Command } from 'commander';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    addUploadDryRunOption,
    collectOrganizationUploadPlan,
    createUploadDryRunGroup,
    printUploadDryRunPlan,
} from './uploadDryRun';

describe('addUploadDryRunOption', () => {
    it('accepts --dry-run', () => {
        const command = new Command();
        addUploadDryRunOption(command);
        command.parse(['--dry-run'], { from: 'user' });

        expect(command.opts().dryRun).toBe(true);
    });

    it('defaults --dry-run to false', () => {
        const command = new Command();
        addUploadDryRunOption(command);
        command.parse([], { from: 'user' });

        expect(command.opts().dryRun).toBe(false);
    });
});

describe('createUploadDryRunGroup', () => {
    it('omits empty groups and sorts slugs', () => {
        expect(
            createUploadDryRunGroup({
                label: 'Charts',
                singular: 'chart',
                slugs: [],
            }),
        ).toBeNull();

        expect(
            createUploadDryRunGroup({
                label: 'Charts',
                singular: 'chart',
                slugs: ['zeta', 'alpha'],
                unchangedSlugs: ['unchanged-chart'],
            }),
        ).toEqual({
            label: 'Charts',
            singular: 'chart',
            items: [
                { slug: 'alpha', action: 'UPLOAD' },
                { slug: 'zeta', action: 'UPLOAD' },
                { slug: 'unchanged-chart', action: 'NO_CHANGES' },
            ],
        });
    });
});

describe('printUploadDryRunPlan', () => {
    let output: string[];

    beforeEach(() => {
        output = [];
        vi.spyOn(console, 'info').mockImplementation((message?: unknown) => {
            output.push(String(message ?? ''));
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('prints a grouped would-upload plan', () => {
        printUploadDryRunPlan([
            {
                label: 'Charts',
                singular: 'chart',
                items: [
                    { slug: 'orders-over-time', action: 'UPLOAD' },
                    { slug: 'stale-chart', action: 'NO_CHANGES' },
                ],
            },
        ]);

        const printed = output.join('\n');
        expect(printed).toContain('Dry run — no changes will be made.');
        expect(printed).toContain('would upload chart orders-over-time');
        expect(printed).toContain(
            'would skip chart stale-chart (no local changes)',
        );
        expect(printed).toContain(
            'No files were written and no content was uploaded.',
        );
    });

    it('prints an empty plan', () => {
        printUploadDryRunPlan([]);

        const printed = output.join('\n');
        expect(printed).toContain('Dry run — no changes will be made.');
        expect(printed).toContain('Nothing would be uploaded.');
    });
});

describe('collectOrganizationUploadPlan', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'org-upload-dry-run-'),
        );
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('lists organization files without requiring an API', async () => {
        await fs.mkdir(path.join(tmpDir, 'custom-roles'), { recursive: true });
        await fs.writeFile(
            path.join(tmpDir, 'custom-roles', 'developer.yml'),
            [
                'version: 1',
                'name: Developer view only',
                'description: null',
                'level: project',
                'scopes:',
                '  - view:Dashboard',
                '',
            ].join('\n'),
        );

        await expect(collectOrganizationUploadPlan(tmpDir)).resolves.toEqual([
            {
                label: 'Custom roles',
                singular: 'custom role',
                items: [{ slug: 'Developer view only', action: 'UPLOAD' }],
            },
        ]);
    });
});
