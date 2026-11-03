import {
    ForbiddenError,
    toolListLiveSourceFieldsOutputSchema,
    type LiveSourceField,
    type ToolListLiveSourceFieldsArgs,
    type ToolListLiveSourceFieldsOutput,
} from '@lightdash/common';
import { getListLiveSourceFields } from './liveSourceFields';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

const field = (overrides: Partial<LiveSourceField>): LiveSourceField => ({
    name: 'event',
    apiName: 'event',
    kind: 'dimension',
    type: 'string',
    label: 'Event name',
    description: 'The event name.',
    aiHint: null,
    group: null,
    isBuiltIn: true,
    isInternal: false,
    isRequired: false,
    inUse: true,
    usedByChartCount: 0,
    lastEdit: null,
    ...overrides,
});

const plan = field({
    name: 'property_plan',
    apiName: 'properties.plan',
    label: 'plan',
    description: 'The plan event property, as sent to PostHog.',
    isBuiltIn: false,
    inUse: false,
});
const event = field({ usedByChartCount: 4 });

const options = { messages: [], toolCallId: 'tool-call-1', context: {} };

const list = (
    args: Partial<ToolListLiveSourceFieldsArgs>,
    fields: LiveSourceField[] = [event, plan],
) =>
    getListLiveSourceFields({
        listLiveSourceFields: vi.fn().mockResolvedValue({
            exploreName: 'posthog_events',
            scannedAt: null,
            fields,
        }),
    }).execute!(
        { connectionUuid: 'conn-1', status: 'all', search: null, ...args },
        options,
    ) as Promise<ToolListLiveSourceFieldsOutput>;

describe('listLiveSourceFields', () => {
    it('lists available fields matching the search, with the id a query uses', async () => {
        const output = await list({ status: 'available', search: 'PLAN' });

        expect(
            toolListLiveSourceFieldsOutputSchema.safeParse(output).success,
        ).toBe(true);
        expect(output.structuredContent).toMatchObject({
            exploreName: 'posthog_events',
            matchCount: 1,
            fields: [
                {
                    name: 'property_plan',
                    fieldId: 'posthog_events_property_plan',
                    source: 'properties.plan',
                    inUse: false,
                },
            ],
        });
    });

    it('caps the rows and says how many more match', async () => {
        const many = Array.from({ length: 60 }, (_, index) =>
            field({ name: `property_${index}` }),
        );
        const output = await list({}, many);

        if (!('fields' in output.structuredContent)) {
            throw new Error('expected fields');
        }
        expect(output.structuredContent.fields).toHaveLength(50);
        expect(output.structuredContent.matchCount).toBe(60);
        expect(output.result).toContain('10 more fields match');
    });

    it('returns an error the model can read when the source is unreadable', async () => {
        const output = (await getListLiveSourceFields({
            listLiveSourceFields: vi
                .fn()
                .mockRejectedValue(new ForbiddenError('No access')),
        }).execute!(
            { connectionUuid: 'conn-1', status: 'all', search: null },
            options,
        )) as ToolListLiveSourceFieldsOutput;

        expect(
            toolListLiveSourceFieldsOutputSchema.safeParse(output).success,
        ).toBe(true);
        expect(output.metadata.status).toBe('error');
    });
});
