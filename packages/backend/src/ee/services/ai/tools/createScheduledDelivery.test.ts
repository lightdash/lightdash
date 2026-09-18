import {
    NotFoundError,
    toolCreateScheduledDeliveryOutputSchema,
    type ToolCreateScheduledDeliveryArgs,
} from '@lightdash/common';
import { getCreateScheduledDelivery } from './createScheduledDelivery';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const args: ToolCreateScheduledDeliveryArgs = {
    resourceType: 'chart',
    resourceUuidOrSlug: 'chart-uuid',
    name: 'Weekly revenue',
    cron: '0 9 * * 1',
    timezone: 'Europe/London',
    format: 'image',
    csvOptions: null,
    message: null,
    targets: [
        { type: 'slack', channel: 'C0123ABCDEF' },
        { type: 'email', recipient: 'finance@example.com' },
    ],
    enabled: false,
    aiAugmentationPrompt: null,
};

const execute = async (
    tool: ReturnType<typeof getCreateScheduledDelivery>,
    input: ToolCreateScheduledDeliveryArgs,
) => {
    if (!tool.execute) throw new Error('tool has no execute');
    const raw = await tool.execute(input, {
        messages: [],
        toolCallId: 'tool-call-1',
    });
    const parsed = toolCreateScheduledDeliveryOutputSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw parsed.error;
    return parsed.data;
};

describe('getCreateScheduledDelivery', () => {
    it('renders the created delivery as text and structured content', async () => {
        const createScheduledDelivery = vi.fn().mockResolvedValue({
            scheduler: {
                schedulerUuid: 'scheduler-uuid',
                name: 'Weekly revenue',
                cron: '0 9 * * 1',
                timezone: 'Europe/London',
                enabled: false,
            },
            resourceUuid: 'resolved-chart-uuid',
            href: 'https://app.lightdash.cloud/deliveries/scheduler-uuid',
            aiAugmentationAttached: true,
            warnings: ['Slack channel is private; invite the Lightdash app.'],
        });
        const tool = getCreateScheduledDelivery({ createScheduledDelivery });

        const output = await execute(tool, args);

        expect(createScheduledDelivery).toHaveBeenCalledWith(
            expect.objectContaining({
                resourceType: 'chart',
                resourceUuidOrSlug: 'chart-uuid',
                aiAugmentationPrompt: null,
            }),
        );
        expect(output.metadata).toEqual({
            status: 'success',
            schedulerUuid: 'scheduler-uuid',
            name: 'Weekly revenue',
            cron: '0 9 * * 1',
            resourceType: 'chart',
            resourceUuid: 'resolved-chart-uuid',
            href: 'https://app.lightdash.cloud/deliveries/scheduler-uuid',
            aiAugmentationAttached: true,
            warnings: ['Slack channel is private; invite the Lightdash app.'],
        });
        expect(output.structuredContent).toEqual({
            schedulerUuid: 'scheduler-uuid',
            name: 'Weekly revenue',
            cron: '0 9 * * 1',
            timezone: 'Europe/London',
            targets: [
                { type: 'slack', channel: 'C0123ABCDEF' },
                { type: 'email', recipient: 'finance@example.com' },
            ],
            enabled: false,
            aiAugmentationAttached: true,
            href: 'https://app.lightdash.cloud/deliveries/scheduler-uuid',
            warnings: ['Slack channel is private; invite the Lightdash app.'],
        });
        expect(output.result).toBe(
            [
                'Created scheduled delivery "Weekly revenue" (uuid: scheduler-uuid).',
                'Schedule: 0 9 * * 1 (Europe/London).',
                'Targets: Slack C0123ABCDEF, finance@example.com.',
                'The delivery was created paused (disabled).',
                'AI augmentation is attached and will write the delivery message on each send.',
                "Share this markdown link with the user verbatim (the link text must be the delivery name) — it opens the delivery's settings, where it can be reviewed, paused, edited or deleted: [Weekly revenue](https://app.lightdash.cloud/deliveries/scheduler-uuid)",
                'Slack channel is private; invite the Lightdash app.',
            ].join('\n'),
        );
    });

    it('omits the timezone and AI augmentation lines when absent', async () => {
        const tool = getCreateScheduledDelivery({
            createScheduledDelivery: vi.fn().mockResolvedValue({
                scheduler: {
                    schedulerUuid: 'scheduler-uuid',
                    name: 'Weekly revenue',
                    cron: '0 9 * * 1',
                    timezone: undefined,
                    enabled: true,
                },
                resourceUuid: 'resolved-chart-uuid',
                href: 'https://app.lightdash.cloud/deliveries/scheduler-uuid',
                aiAugmentationAttached: false,
                warnings: [],
            }),
        });

        const output = await execute(tool, { ...args, enabled: true });

        expect(output.result).toContain('Schedule: 0 9 * * 1.\n');
        expect(output.result).toContain('The delivery is enabled and live.');
        expect(output.result).not.toContain('AI augmentation');
        expect(output.structuredContent).toMatchObject({
            timezone: null,
            enabled: true,
            aiAugmentationAttached: false,
            warnings: [],
        });
    });

    it('mirrors the error text as structured content when creation fails', async () => {
        const tool = getCreateScheduledDelivery({
            createScheduledDelivery: vi
                .fn()
                .mockRejectedValue(new NotFoundError('Chart not found')),
        });

        const output = await execute(tool, args);

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain(
            'Error creating scheduled delivery "Weekly revenue". The delivery was not created.',
        );
        expect(output.result).toContain('Chart not found');
        expect(output.structuredContent).toEqual({ error: output.result });
    });
});
