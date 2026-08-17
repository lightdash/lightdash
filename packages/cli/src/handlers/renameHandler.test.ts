import {
    RenameChange,
    RenameType,
    SchedulerJobStatus,
} from '@lightdash/common';
import fs from 'fs';
import path from 'path';
import { LightdashAnalytics } from '../analytics/analytics';
import { getConfig } from '../config';
import { checkLightdashVersion, lightdashApi } from './dbt/apiClient';
import { getProject } from './dbt/refresh';
import { renameHandler } from './renameHandler';

vi.mock('../analytics/analytics');
vi.mock('../config');
vi.mock('./dbt/apiClient');
vi.mock('./dbt/refresh');

type RenameOptions = Parameters<typeof renameHandler>[0];

const baseOptions: RenameOptions = {
    verbose: false,
    type: RenameType.FIELD,
    project: 'test-project-uuid',
    from: 'old_name',
    to: 'new_name',
    dryRun: false,
    assumeYes: true,
    list: false,
    validate: true,
};

type RenameResults = {
    charts: RenameChange[];
    dashboards: RenameChange[];
    alerts: RenameChange[];
    dashboardSchedulers: RenameChange[];
};

const emptyResults: RenameResults = {
    charts: [],
    dashboards: [],
    alerts: [],
    dashboardSchedulers: [],
};

const RENAME_JOB_ID = 'rename-job-id';
const VALIDATION_JOB_ID = 'validation-job-id';

describe('renameHandler follow-up validation', () => {
    let errorOutput: string[];

    const mockApi = (
        failingJobId: string | null,
        results: RenameResults = emptyResults,
    ) => {
        vi.mocked(lightdashApi).mockImplementation(async ({ method, url }) => {
            if (method === 'POST' && url.endsWith('/rename')) {
                return { jobId: RENAME_JOB_ID };
            }
            if (method === 'POST' && url.endsWith('/validate')) {
                return { jobId: VALIDATION_JOB_ID };
            }
            if (url.includes(`/schedulers/job/${failingJobId}/status`)) {
                return {
                    status: SchedulerJobStatus.ERROR,
                    details: { error: 'job blew up' },
                };
            }
            if (url.includes('/schedulers/job/')) {
                return {
                    status: SchedulerJobStatus.COMPLETED,
                    details: { results },
                };
            }
            if (url.includes('/validate?jobId=')) {
                return [];
            }
            throw new Error(`Unexpected API call: ${method} ${url}`);
        });
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(checkLightdashVersion).mockResolvedValue(undefined);
        vi.mocked(getConfig).mockResolvedValue({
            context: {
                apiKey: 'test-key',
                serverUrl: 'http://localhost',
                project: 'test-project-uuid',
            },
        } as Awaited<ReturnType<typeof getConfig>>);
        vi.mocked(getProject).mockResolvedValue({
            name: 'test project',
        } as Awaited<ReturnType<typeof getProject>>);

        errorOutput = [];
        vi.spyOn(console, 'error').mockImplementation((...args) => {
            errorOutput.push(args.map(String).join(' '));
        });
        vi.spyOn(console, 'info').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const trackedEvents = () =>
        vi.mocked(LightdashAnalytics.track).mock.calls.map(([payload]) => ({
            event: payload.event,
            properties: payload.properties,
        }));

    test('reports a failed validation job as a validation failure, not a rename failure', async () => {
        mockApi(VALIDATION_JOB_ID);

        await renameHandler({ ...baseOptions });

        const output = errorOutput.join('\n');
        expect(output).toContain('Rename completed');
        expect(output).toContain('Validation failed: job blew up');
        expect(output).not.toContain('Rename failed');
        expect(output).not.toContain('unexpected error');
    });

    test('counts a rename whose follow-up validation failed as completed', async () => {
        mockApi(VALIDATION_JOB_ID);

        await renameHandler({ ...baseOptions });

        expect(trackedEvents()).toEqual([
            {
                event: 'rename.completed',
                properties: expect.objectContaining({
                    validationStatus: 'failed',
                }),
            },
        ]);
    });

    test('still reports a failed rename job as a rename failure', async () => {
        mockApi(RENAME_JOB_ID);

        await renameHandler({ ...baseOptions });

        const output = errorOutput.join('\n');
        expect(output).toContain('Rename failed: job blew up');
        expect(output).not.toContain('Validation failed');
        expect(trackedEvents()).toEqual([
            { event: 'rename.error', properties: expect.anything() },
        ]);
    });

    test('records a passing validation on the completed event', async () => {
        mockApi(null);

        await renameHandler({ ...baseOptions });

        expect(trackedEvents()).toEqual([
            {
                event: 'rename.completed',
                properties: expect.objectContaining({
                    validationStatus: 'passed',
                }),
            },
        ]);
    });

    test('does not run the validation job when --validate is not set', async () => {
        mockApi(null);

        await renameHandler({ ...baseOptions, validate: false });

        const validationCalls = vi
            .mocked(lightdashApi)
            .mock.calls.filter(([{ url }]) => url.endsWith('/validate'));
        expect(validationCalls).toEqual([]);

        const output = errorOutput.join('\n');
        expect(output).not.toContain('failed');
        expect(output).not.toContain('unexpected error');
        expect(trackedEvents()).toEqual([
            {
                event: 'rename.completed',
                properties: expect.objectContaining({
                    validationStatus: 'skipped',
                }),
            },
        ]);
    });

    test('saves rename changes in the current working directory', async () => {
        const results = {
            ...emptyResults,
            charts: [{ uuid: 'chart-uuid', name: 'renamed chart' }],
        };
        mockApi(null, results);
        const writeFileSync = vi
            .spyOn(fs, 'writeFileSync')
            .mockImplementation(() => undefined);

        await renameHandler({ ...baseOptions, validate: false });

        expect(writeFileSync).toHaveBeenCalledWith(
            path.join(
                process.cwd(),
                `rename old_name to new_name ${
                    new Date().toISOString().split('T')[0]
                }.json`,
            ),
            JSON.stringify(results, null, 2),
            'utf-8',
        );
    });

    test('reports a changelog write failure without reporting the committed rename as failed', async () => {
        mockApi(null, {
            ...emptyResults,
            charts: [{ uuid: 'chart-uuid', name: 'renamed chart' }],
        });
        vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
            throw new Error('read-only bundle');
        });

        await renameHandler({ ...baseOptions, validate: false });

        const output = errorOutput.join('\n');
        expect(output).toContain('Rename completed');
        expect(output).toContain('read-only bundle');
        expect(output).not.toContain('Unable to rename');
        expect(trackedEvents()).toEqual([
            {
                event: 'rename.completed',
                properties: expect.objectContaining({
                    validationStatus: 'skipped',
                }),
            },
        ]);
    });
});
