import { JobStatusType, JobType, type Job } from '@lightdash/common';
import { getJobCompletionToast } from './useRefreshServer';

const compileJob = (errorCount: number, total: number): Job => ({
    jobUuid: 'job-uuid',
    projectUuid: 'project-uuid',
    userUuid: 'user-uuid',
    createdAt: new Date(),
    updatedAt: new Date(),
    jobStatus: JobStatusType.DONE,
    jobType: JobType.COMPILE_PROJECT,
    steps: [],
    jobResults: {
        indexCatalogJobUuid: 'catalog-job-uuid',
        errorCount,
        total,
    },
});

describe('getJobCompletionToast', () => {
    test('warns when a successful sync contains explore errors', () => {
        expect(getJobCompletionToast(compileJob(2, 10))).toEqual({
            variant: 'warning',
            title: 'Synced: 2 of 10 tables have errors',
        });
    });

    test('keeps the successful sync message when every explore is valid', () => {
        expect(getJobCompletionToast(compileJob(0, 10))).toEqual({
            variant: 'success',
            title: 'Successfully synced dbt project!',
        });
    });
});
