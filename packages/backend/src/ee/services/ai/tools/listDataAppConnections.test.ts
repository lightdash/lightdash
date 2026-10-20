import { toolListDataAppConnectionsOutputSchema } from '@lightdash/common';
import { getListDataAppConnections } from './listDataAppConnections';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const execute = async (
    tool: ReturnType<typeof getListDataAppConnections>,
    appSlug: string | null = null,
) => {
    if (!tool.execute) throw new Error('tool has no execute');
    const output = await tool.execute(
        { appSlug },
        { messages: [], toolCallId: 'tool-call-1', context: {} },
    );
    expect(
        toolListDataAppConnectionsOutputSchema.safeParse(output).success,
    ).toBe(true);
    return toolListDataAppConnectionsOutputSchema.parse(output);
};

const connections = [
    {
        slug: 'amplitude-1',
        name: 'Amplitude',
        authType: 'api_key' as const,
        origin: 'https://amplitude.com',
        instructions: 'Use the export API',
        linkedAliases: ['amplitude'],
    },
];

describe('getListDataAppConnections', () => {
    it('renders each connection and forwards appSlug', async () => {
        const listDataAppConnections = vi.fn().mockResolvedValue(connections);

        const output = await execute(
            getListDataAppConnections({ listDataAppConnections }),
            'revenue-app',
        );

        expect(listDataAppConnections).toHaveBeenCalledWith({
            appSlug: 'revenue-app',
        });
        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.result).toContain('slug="amplitude-1"');
        expect(output.result).toContain('<name>Amplitude</name>');
        expect(output.result).toContain(
            '<instructions>Use the export API</instructions>',
        );
        expect(output.result).toContain('linkedAs="amplitude"');
        expect(output.structuredContent).toEqual({ connections });
    });

    it('tells the agent to omit externalConnectionSlugs when none are available', async () => {
        const output = await execute(
            getListDataAppConnections({
                listDataAppConnections: vi.fn().mockResolvedValue([]),
            }),
        );

        expect(output.result).toContain('Omit externalConnectionSlugs');
        expect(output.structuredContent).toEqual({ connections: [] });
    });

    it('returns an error envelope on failure', async () => {
        const output = await execute(
            getListDataAppConnections({
                listDataAppConnections: vi
                    .fn()
                    .mockRejectedValue(new Error('Data apps are not enabled')),
            }),
        );

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Data apps are not enabled');
        expect(output.structuredContent).toEqual({ error: output.result });
    });
});
