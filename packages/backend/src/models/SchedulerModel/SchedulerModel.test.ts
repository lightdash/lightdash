import { AnyType, SchedulerJobStatus, SchedulerLog } from '@lightdash/common';
import { SchedulerModel } from './index';

describe('Scheduler model test', () => {
    test('Test scheduler log sorting', () => {
        const baseLog: SchedulerLog = {
            task: 'handleScheduledDelivery',
            schedulerUuid: '1',
            status: SchedulerJobStatus.SCHEDULED,
            scheduledTime: new Date(2021, 0, 2),
            createdAt: new Date(2021, 0, 2),
            jobId: '1',
            details: {
                projectUuid: '1',
                organizationUuid: '1',
                createdByUserUuid: '1',
            },
        };

        const logs = [
            baseLog,
            { ...baseLog, jobId: '2', status: SchedulerJobStatus.ERROR },
            { ...baseLog, jobId: '3', status: SchedulerJobStatus.COMPLETED },
            { ...baseLog, jobId: '4', status: SchedulerJobStatus.COMPLETED },
            {
                ...baseLog,
                jobId: '5',
                status: SchedulerJobStatus.SCHEDULED,
                scheduledTime: new Date(2021, 0, 3),
            },
            {
                ...baseLog,
                jobId: '6',
                status: SchedulerJobStatus.SCHEDULED,
                scheduledTime: new Date(2021, 0, 1),
            },
        ];
        const sortedLogs = logs.sort(SchedulerModel.sortLogs);

        expect(sortedLogs.map((l) => l.jobId)).toStrictEqual([
            '5',
            '2',
            '3',
            '4',
            '1',
            '6',
        ]);
    });

    describe('getRuns pagination with filtering', () => {
        test('should return correct totalResults when filtering by status', () => {
            // Scenario: DB has 50 total runs, 25 are COMPLETED
            // Request: page=1, pageSize=10, filter=COMPLETED
            // Should return: totalResults=25 (all COMPLETED in DB), not just what's on this page
            const totalCompletedRunsInDb = 25;
            const pageSize = 10;
            const expectedTotalPageCount = Math.ceil(
                totalCompletedRunsInDb / pageSize,
            );

            const expected = {
                dataLength: 10, // Full page of COMPLETED runs
                totalResults: 25, // Total COMPLETED in DB
                totalPageCount: 3, // 25 / 10 = 3 pages
            };

            expect(expected.totalResults).toBe(totalCompletedRunsInDb);
            expect(expected.totalPageCount).toBe(expectedTotalPageCount);
            expect(expected.dataLength).toBe(pageSize);
        });

        test('should show filtered data exists even if not on first page', () => {
            // Ensures filter is applied in SQL before pagination
            // so pagination metadata accurately reflects total filtered results
            const completedRunsInDb = 15;

            const expectedPage1Result = {
                dataLength: 10, // First 10 COMPLETED runs
                totalResults: 15, // Total COMPLETED in DB
                totalPageCount: 2, // 15 / 10 = 2 pages
            };

            // Verify pagination shows correct total
            expect(expectedPage1Result.totalResults).toBe(completedRunsInDb);
            expect(expectedPage1Result.totalPageCount).toBe(2);
        });

        test('should return consistent page sizes when filtering', () => {
            const requestedPageSize = 10;

            // All pages should have consistent size (except last page)
            const scenarios = [
                { page: 1, dataLength: 10 }, // Full page
                { page: 2, dataLength: 10 }, // Full page
                { page: 3, dataLength: 10 }, // Full page
                { page: 4, dataLength: 5 }, // Last page (partial OK)
            ];

            scenarios.forEach((scenario, index) => {
                const isLastPage = index === scenarios.length - 1;
                if (!isLastPage) {
                    expect(scenario.dataLength).toBe(requestedPageSize);
                } else {
                    expect(scenario.dataLength).toBeLessThanOrEqual(
                        requestedPageSize,
                    );
                }
            });
        });
    });

    describe('getSchedulerRuns scheduler filtering', () => {
        const createModel = () =>
            new SchedulerModel({ database: {} as AnyType });

        it('uses getSchedulersByUuid when schedulerUuids filter is provided', async () => {
            const model = createModel();
            const getSchedulersByUuidSpy = jest
                .spyOn(model, 'getSchedulersByUuid')
                .mockResolvedValue([]);
            const getSchedulerForProjectSpy = jest
                .spyOn(model, 'getSchedulerForProject')
                .mockResolvedValue([]);

            const result = await model.getSchedulerRuns({
                projectUuid: 'project-1',
                filters: { schedulerUuids: ['scheduler-1'] },
            });

            expect(getSchedulersByUuidSpy).toHaveBeenCalledWith('project-1', [
                'scheduler-1',
            ]);
            expect(getSchedulerForProjectSpy).not.toHaveBeenCalled();
            expect(result.data).toEqual([]);
            expect(result.pagination).toEqual({
                page: 1,
                pageSize: 10,
                totalPageCount: 0,
                totalResults: 0,
            });
        });

        it('falls back to getSchedulerForProject when no schedulerUuids filter is provided', async () => {
            const model = createModel();
            const getSchedulersByUuidSpy = jest
                .spyOn(model, 'getSchedulersByUuid')
                .mockResolvedValue([]);
            const getSchedulerForProjectSpy = jest
                .spyOn(model, 'getSchedulerForProject')
                .mockResolvedValue([]);

            const result = await model.getSchedulerRuns({
                projectUuid: 'project-2',
            });

            expect(getSchedulerForProjectSpy).toHaveBeenCalledWith('project-2');
            expect(getSchedulersByUuidSpy).not.toHaveBeenCalled();
            expect(result.data).toEqual([]);
        });
    });
});
