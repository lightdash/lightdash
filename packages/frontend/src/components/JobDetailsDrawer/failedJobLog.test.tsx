import {
    JobLabels,
    JobStatusType,
    JobStepStatusType,
    JobStepType,
    JobType,
    type DbtLog,
    type Job,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ActiveJobContext from '../../providers/ActiveJob/context';
import { formatFailedJobLog } from './failedJobLog';
import JobDetailsDrawer from './index';

const log = (level: DbtLog['info']['level'], msg: string): DbtLog => ({
    code: 'E001',
    info: {
        category: 'dbt',
        code: 'E001',
        extra: {},
        invocation_id: 'run-uuid',
        level,
        log_version: 2,
        msg,
        name: 'CompilationError',
        pid: 1,
        thread_name: 'MainThread',
        ts: '2026-10-07T00:00:00Z',
        type: 'log_line',
    },
});

const failedJob: Job = {
    jobUuid: 'job-uuid',
    projectUuid: 'project-uuid',
    userUuid: 'user-uuid',
    createdAt: new Date('2026-10-07T00:00:00Z'),
    updatedAt: new Date('2026-10-07T00:01:00Z'),
    jobType: JobType.COMPILE_PROJECT,
    jobStatus: JobStatusType.ERROR,
    steps: [
        {
            jobUuid: 'job-uuid',
            createdAt: new Date('2026-10-07T00:00:00Z'),
            updatedAt: new Date('2026-10-07T00:01:00Z'),
            startedAt: new Date('2026-10-07T00:00:00Z'),
            stepType: JobStepType.COMPILING,
            stepLabel: JobLabels[JobStepType.COMPILING],
            stepStatus: JobStepStatusType.ERROR,
            stepError:
                'Failed to load dbt source "finance": Failed to run dbt ls',
            stepDbtLogs: [
                log('info', 'Starting dbt ls'),
                log('debug', 'Loading finance models'),
                log('warn', 'Deprecated configuration'),
                log('error', 'macro missing_macro is undefined'),
            ],
        },
    ],
};

describe('failed compilation log download', () => {
    it('includes all captured levels in order, the source error, and capture limitations', () => {
        const text = formatFailedJobLog(failedJob);

        expect(text).toContain('job-uuid');
        expect(text).toContain('Failed to load dbt source "finance"');
        expect(text).toContain('[info] Starting dbt ls');
        expect(text).toContain('[debug] Loading finance models');
        expect(text).toContain('[warn] Deprecated configuration');
        expect(text).toContain('[error] macro missing_macro is undefined');
        expect(text.indexOf('Starting dbt ls')).toBeLessThan(
            text.indexOf('macro missing_macro'),
        );
        expect(text).toContain('stderr may not have been captured');
    });

    it('explains missing output and steps that did not run', () => {
        const text = formatFailedJobLog({
            ...failedJob,
            steps: [
                { ...failedJob.steps[0], stepDbtLogs: undefined },
                {
                    ...failedJob.steps[0],
                    stepStatus: JobStepStatusType.SKIPPED,
                    stepError: undefined,
                    stepDbtLogs: undefined,
                },
            ],
        });

        expect(text).toContain('No dbt output was captured');
        expect(text).toContain('This step did not run');
        expect(text).toContain(failedJob.steps[0].stepError!);
    });

    it('downloads a text file directly from a failed job without compilation history', async () => {
        const createObjectURL = vi.fn((_blob: Blob) => 'blob:compilation-log');
        const revokeObjectURL = vi.fn();
        vi.stubGlobal('URL', {
            createObjectURL,
            revokeObjectURL,
        });
        const click = vi
            .spyOn(HTMLAnchorElement.prototype, 'click')
            .mockImplementation(() => {});
        try {
            render(
                <MantineProvider>
                    <ActiveJobContext.Provider
                        value={{
                            activeJob: failedJob,
                            activeJobId: failedJob.jobUuid,
                            activeJobIsRunning: false,
                            isJobsDrawerOpen: true,
                            setActiveJobId: vi.fn(),
                            setQuietActiveJobId: vi.fn(),
                            setIsJobsDrawerOpen: vi.fn(),
                        }}
                    >
                        <JobDetailsDrawer />
                    </ActiveJobContext.Provider>
                </MantineProvider>,
            );
            await userEvent.click(
                screen.getByRole('button', { name: 'Download captured logs' }),
            );

            expect(click).toHaveBeenCalledOnce();
            const anchor = click.mock.instances[0] as HTMLAnchorElement;
            expect(anchor.download).toBe('compilation-job-uuid.txt');
            const blob = createObjectURL.mock.calls[0][0] as Blob;
            expect(blob.type).toBe('text/plain;charset=utf-8');
            const contents = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.readAsText(blob);
            });
            expect(contents).toBe(formatFailedJobLog(failedJob));
            await vi.waitFor(() =>
                expect(revokeObjectURL).toHaveBeenCalledWith(
                    'blob:compilation-log',
                ),
            );
        } finally {
            click.mockRestore();
            vi.unstubAllGlobals();
        }
    });
});
