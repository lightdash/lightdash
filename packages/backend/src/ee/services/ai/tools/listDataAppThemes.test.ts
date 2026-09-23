import { getListDataAppThemes } from './listDataAppThemes';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

type Output = { result: string; metadata: { status: string } };

const execute = (tool: ReturnType<typeof getListDataAppThemes>) =>
    tool.execute!(
        {},
        { messages: [], toolCallId: 'tool-call-1', context: {} },
    ) as Promise<Output>;

describe('getListDataAppThemes', () => {
    it('renders slug, name, default flag and description per theme', async () => {
        const output = await execute(
            getListDataAppThemes({
                listDataAppThemes: vi.fn().mockResolvedValue([
                    {
                        slug: 'brand',
                        name: 'Brand',
                        isDefault: true,
                        description: 'Company colours',
                    },
                    {
                        slug: 'dark',
                        name: 'Dark',
                        isDefault: false,
                        description: null,
                    },
                ]),
            }),
        );

        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.result).toContain('<themes count="2">');
        expect(output.result).toContain(
            '<theme slug="brand" isDefault="true">',
        );
        expect(output.result).toContain(
            '<description>Company colours</description>',
        );
        expect(output.result).toContain(
            '<theme slug="dark" isDefault="false">',
        );
        expect(output.result).not.toContain('<description></description>');
    });

    it('tells the agent to omit themeSlug when the organization has no themes', async () => {
        const output = await execute(
            getListDataAppThemes({
                listDataAppThemes: vi.fn().mockResolvedValue([]),
            }),
        );

        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.result).toContain('no themes');
    });
});
