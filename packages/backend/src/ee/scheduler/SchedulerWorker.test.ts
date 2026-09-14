import { EE_SCHEDULER_TASKS } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import {
    AI_DEEP_RESEARCH_REPORT_CLEANUP_BATCH_SIZE,
    cleanAiDeepResearchReports,
} from './SchedulerWorker';

describe('cleanAiDeepResearchReports', () => {
    const buildDependencies = (result: {
        scanned: number;
        expired: number;
        failed: number;
    }) => ({
        aiDeepResearchService: {
            cleanExpiredReports: vi.fn().mockResolvedValue(result),
        },
        cleanupMetrics: {
            incrementAiDeepResearchReportCleanup: vi.fn(),
        },
        addJob: vi.fn().mockResolvedValue({}),
    });

    it('records all cleanup counts without continuing a partial batch', async () => {
        const dependencies = buildDependencies({
            scanned: 4,
            expired: 3,
            failed: 0,
        });

        await cleanAiDeepResearchReports(dependencies);

        expect(
            dependencies.aiDeepResearchService.cleanExpiredReports,
        ).toHaveBeenCalledWith(AI_DEEP_RESEARCH_REPORT_CLEANUP_BATCH_SIZE);
        expect(
            dependencies.cleanupMetrics.incrementAiDeepResearchReportCleanup
                .mock.calls,
        ).toEqual([
            ['scanned', 4],
            ['expired', 3],
            ['failed', 0],
        ]);
        expect(dependencies.addJob).not.toHaveBeenCalled();
    });

    it('queues another bounded batch when the current batch is full', async () => {
        const dependencies = buildDependencies({
            scanned: AI_DEEP_RESEARCH_REPORT_CLEANUP_BATCH_SIZE,
            expired: AI_DEEP_RESEARCH_REPORT_CLEANUP_BATCH_SIZE,
            failed: 0,
        });

        await cleanAiDeepResearchReports(dependencies);

        expect(dependencies.addJob).toHaveBeenCalledWith(
            EE_SCHEDULER_TASKS.CLEAN_AI_DEEP_RESEARCH_REPORTS,
            {},
            { maxAttempts: 3 },
        );
    });

    it('throws for retry and does not continue when any row fails', async () => {
        const dependencies = buildDependencies({
            scanned: AI_DEEP_RESEARCH_REPORT_CLEANUP_BATCH_SIZE,
            expired: AI_DEEP_RESEARCH_REPORT_CLEANUP_BATCH_SIZE - 1,
            failed: 1,
        });

        await expect(cleanAiDeepResearchReports(dependencies)).rejects.toThrow(
            'Failed to clean 1 Deep Research reports',
        );
        expect(dependencies.addJob).not.toHaveBeenCalled();
    });
});
