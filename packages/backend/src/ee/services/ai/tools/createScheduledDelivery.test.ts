import {
    SchedulerFormat,
    type SchedulerAndTargets,
    type ToolCreateScheduledDeliveryArgs,
} from '@lightdash/common';
import type { CreateScheduledDeliveryFn } from '../types/aiAgentDependencies';
import { getCreateScheduledDelivery } from './createScheduledDelivery';

const makeScheduler = (
    overrides: Partial<SchedulerAndTargets> = {},
): SchedulerAndTargets =>
    ({
        schedulerUuid: 'scheduler-uuid-1',
        name: 'Weekly sales',
        cron: '0 9 * * 1',
        timezone: 'Europe/London',
        enabled: true,
        targets: [],
        ...overrides,
    }) as SchedulerAndTargets;

const makeArgs = (
    overrides: Partial<ToolCreateScheduledDeliveryArgs> = {},
): ToolCreateScheduledDeliveryArgs => ({
    resourceType: 'chart',
    resourceUuid: 'chart-uuid-1',
    name: 'Weekly sales',
    cron: '0 9 * * 1',
    timezone: 'Europe/London',
    format: 'image',
    csvOptions: null,
    message: null,
    targets: [{ type: 'slack', channel: 'C0123ABCDEF' }],
    enabled: true,
    aiAugmentationPrompt: null,
    ...overrides,
});

const executeTool = async (
    createScheduledDelivery: CreateScheduledDeliveryFn,
    args: ToolCreateScheduledDeliveryArgs,
) => {
    const tool = getCreateScheduledDelivery({ createScheduledDelivery });
    return tool.execute!(args, { toolCallId: 'tool-call-1', messages: [] });
};

describe('createScheduledDelivery tool', () => {
    it('maps image format to an image scheduler payload', async () => {
        const fn = vi.fn().mockResolvedValue({
            scheduler: makeScheduler(),
            aiAugmentationAttached: false,
            warnings: [],
        });

        await executeTool(fn, makeArgs());

        expect(fn).toHaveBeenCalledWith(
            expect.objectContaining({
                resourceType: 'chart',
                resourceUuid: 'chart-uuid-1',
                aiAugmentationPrompt: null,
                scheduler: expect.objectContaining({
                    format: SchedulerFormat.IMAGE,
                    options: {},
                    enabled: true,
                    includeLinks: true,
                    appUuid: null,
                    appName: null,
                    timezone: 'Europe/London',
                    targets: [{ channel: 'C0123ABCDEF' }],
                }),
            }),
        );
    });

    it('maps csv format with defaults when csvOptions is null', async () => {
        const fn = vi.fn().mockResolvedValue({
            scheduler: makeScheduler(),
            aiAugmentationAttached: false,
            warnings: [],
        });

        await executeTool(
            fn,
            makeArgs({
                format: 'csv',
                targets: [{ type: 'email', recipient: 'user@example.com' }],
            }),
        );

        expect(fn).toHaveBeenCalledWith(
            expect.objectContaining({
                scheduler: expect.objectContaining({
                    format: SchedulerFormat.CSV,
                    options: { formatted: true, limit: 'table' },
                    targets: [{ recipient: 'user@example.com' }],
                }),
            }),
        );
    });

    it('passes explicit csvOptions through', async () => {
        const fn = vi.fn().mockResolvedValue({
            scheduler: makeScheduler(),
            aiAugmentationAttached: false,
            warnings: [],
        });

        await executeTool(
            fn,
            makeArgs({
                format: 'csv',
                csvOptions: { formatted: false, limit: 500 },
            }),
        );

        expect(fn).toHaveBeenCalledWith(
            expect.objectContaining({
                scheduler: expect.objectContaining({
                    options: { formatted: false, limit: 500 },
                }),
            }),
        );
    });

    it('returns success metadata with the scheduler uuid', async () => {
        const fn = vi.fn().mockResolvedValue({
            scheduler: makeScheduler(),
            aiAugmentationAttached: true,
            warnings: [],
        });

        const output = await executeTool(
            fn,
            makeArgs({ aiAugmentationPrompt: 'Summarise the results' }),
        );

        expect(output.metadata).toEqual({
            status: 'success',
            schedulerUuid: 'scheduler-uuid-1',
            name: 'Weekly sales',
            cron: '0 9 * * 1',
            resourceType: 'chart',
            resourceUuid: 'chart-uuid-1',
            aiAugmentationAttached: true,
            warnings: [],
        });
        expect(output.result).toContain('scheduler-uuid-1');
        expect(output.result).toContain(
            'AI augmentation is attached and will write the delivery message on each send.',
        );
    });

    it('surfaces augmentation-failure warnings on a partial success', async () => {
        const warning =
            'AI augmentation could not be attached: agent has no access. The delivery was created WITHOUT it.';
        const fn = vi.fn().mockResolvedValue({
            scheduler: makeScheduler(),
            aiAugmentationAttached: false,
            warnings: [warning],
        });

        const output = await executeTool(
            fn,
            makeArgs({ aiAugmentationPrompt: 'Summarise the results' }),
        );

        expect(output.metadata).toEqual(
            expect.objectContaining({
                status: 'success',
                aiAugmentationAttached: false,
                warnings: [warning],
            }),
        );
        expect(output.result).toContain(warning);
    });

    it('returns an error result without throwing when creation fails', async () => {
        const fn = vi
            .fn()
            .mockRejectedValue(
                new Error(
                    'Frequency not allowed, custom input is limited to hourly',
                ),
            );

        const output = await executeTool(
            fn,
            makeArgs({ cron: '*/15 * * * *' }),
        );

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Frequency not allowed');
        expect(output.result).toContain('The delivery was not created.');
    });
});
