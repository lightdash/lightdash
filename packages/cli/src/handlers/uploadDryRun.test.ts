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
    summarizeUploadDryRun,
    uploadDryRunWouldChange,
} from './uploadDryRun';

describe('addUploadDryRunOption', () => {
    it('accepts --dry-run, --json, and --strict', () => {
        const command = new Command();
        addUploadDryRunOption(command);
        command.parse(['--dry-run', '--json', '--strict'], { from: 'user' });

        expect(command.opts().dryRun).toBe(true);
        expect(command.opts().json).toBe(true);
        expect(command.opts().strict).toBe(true);
    });

    it('defaults preview flags to false', () => {
        const command = new Command();
        addUploadDryRunOption(command);
        command.parse([], { from: 'user' });

        expect(command.opts().dryRun).toBe(false);
        expect(command.opts().json).toBe(false);
        expect(command.opts().strict).toBe(false);
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
                createSlugs: ['brand-new'],
                skipAheadSlugs: ['edited-on-instance'],
            }),
        ).toEqual({
            label: 'Charts',
            singular: 'chart',
            items: [
                { slug: 'brand-new', action: 'create' },
                { slug: 'alpha', action: 'update' },
                { slug: 'zeta', action: 'update' },
                { slug: 'unchanged-chart', action: 'no_change' },
                { slug: 'edited-on-instance', action: 'skip_ahead' },
            ],
        });
    });
});

describe('summarizeUploadDryRun', () => {
    it('counts verdicts and treats skip-ahead as a change', () => {
        const totals = summarizeUploadDryRun([
            {
                label: 'Charts',
                singular: 'chart',
                items: [
                    { slug: 'new', action: 'create' },
                    { slug: 'changed', action: 'update' },
                    { slug: 'same', action: 'no_change' },
                    { slug: 'ahead', action: 'skip_ahead' },
                ],
            },
        ]);

        expect(totals).toEqual({
            create: 1,
            update: 1,
            no_change: 1,
            skip_ahead: 1,
        });
        expect(uploadDryRunWouldChange(totals)).toBe(true);
        expect(
            uploadDryRunWouldChange({
                create: 0,
                update: 0,
                no_change: 4,
                skip_ahead: 0,
            }),
        ).toBe(false);
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

    it('prints a grouped would-update plan with totals', () => {
        printUploadDryRunPlan([
            {
                label: 'Charts',
                singular: 'chart',
                items: [
                    { slug: 'orders-over-time', action: 'update' },
                    { slug: 'stale-chart', action: 'no_change' },
                    { slug: 'edited-on-instance', action: 'skip_ahead' },
                ],
            },
        ]);

        const printed = output.join('\n');
        expect(printed).toContain('Dry run — no changes will be made.');
        expect(printed).toContain('would update chart orders-over-time');
        expect(printed).toContain('no change chart stale-chart');
        expect(printed).toContain(
            'would skip chart edited-on-instance (instance ahead)',
        );
        expect(printed).toContain(
            'Totals: 0 create, 1 update, 1 no change, 1 skip ahead.',
        );
        expect(printed).toContain(
            'No files were written and no content was uploaded.',
        );
    });

    it('prints JSON when requested', () => {
        printUploadDryRunPlan(
            [
                {
                    label: 'Charts',
                    singular: 'chart',
                    items: [{ slug: 'orders-over-time', action: 'update' }],
                },
            ],
            { json: true },
        );

        expect(JSON.parse(output.join('\n'))).toEqual({
            dryRun: true,
            totals: {
                create: 0,
                update: 1,
                no_change: 0,
                skip_ahead: 0,
            },
            groups: [
                {
                    label: 'Charts',
                    singular: 'chart',
                    items: [{ slug: 'orders-over-time', action: 'update' }],
                },
            ],
        });
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
                items: [{ slug: 'Developer view only', action: 'update' }],
            },
        ]);
    });
});
