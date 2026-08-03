import { type AnyType } from '@lightdash/common';
import { vi } from 'vitest';
import { getConsolidateAgentMemoryScripts } from './consolidateAgentMemory';

describe('consolidateAgentMemory', () => {
    const build = (result: AnyType) => {
        const consolidatePartitionNow = vi.fn().mockResolvedValue(result);
        const scripts = getConsolidateAgentMemoryScripts({
            getAiAgentMemoryService: () => ({ consolidatePartitionNow }),
        } as AnyType);
        return { scripts, consolidatePartitionNow };
    };

    const args = {
        projectUuid: 'project-1',
        ownerUserUuid: 'owner-1',
        triggeredByUserUuid: 'operator-1',
    };

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('forwards an omitted dry-run override and reports the run', async () => {
        const run = {
            ai_agent_memory_consolidation_run_uuid: 'run-1',
            status: 'succeeded',
            dry_run: false,
            input_count: 12,
            input_hash: 'a'.repeat(64),
            applied_count: 2,
            rejected_count: 1,
            error_message: null,
        };
        const { scripts, consolidatePartitionNow } = build({
            outcome: 'consolidated',
            run,
        });

        await expect(scripts.consolidateAgentMemory(args)).resolves.toEqual({
            outcome: 'consolidated',
            run,
        });

        expect(consolidatePartitionNow).toHaveBeenCalledExactlyOnceWith(args);
        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('applied:  2'),
        );
    });

    test('forwards a requested dry run without a run record', async () => {
        const { scripts, consolidatePartitionNow } = build({
            outcome: 'disabled',
            run: null,
        });

        await scripts.consolidateAgentMemory({ ...args, dryRun: true });

        expect(consolidatePartitionNow).toHaveBeenCalledExactlyOnceWith({
            ...args,
            dryRun: true,
        });
        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('no run recorded'),
        );
    });

    test('reports dry-run operations as proposed', async () => {
        const { scripts } = build({
            outcome: 'dry_run',
            run: {
                ai_agent_memory_consolidation_run_uuid: 'run-2',
                status: 'succeeded',
                dry_run: true,
                input_count: 4,
                input_hash: 'b'.repeat(64),
                applied_count: 3,
                rejected_count: 0,
                error_message: null,
            },
        });

        await scripts.consolidateAgentMemory({ ...args, dryRun: true });

        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('proposed:  3'),
        );
    });
});
