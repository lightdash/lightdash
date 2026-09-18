import { toolListDataAppThemesOutputSchema } from '@lightdash/common';
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

const execute = async (tool: ReturnType<typeof getListDataAppThemes>) => {
    if (!tool.execute) throw new Error('tool has no execute');
    const output = await tool.execute(
        {},
        { messages: [], toolCallId: 'tool-call-1' },
    );
    expect(toolListDataAppThemesOutputSchema.safeParse(output).success).toBe(
        true,
    );
    return toolListDataAppThemesOutputSchema.parse(output);
};

const themes = [
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
];

describe('getListDataAppThemes', () => {
    it('renders slug, name, default flag and description per theme', async () => {
        const output = await execute(
            getListDataAppThemes({
                listDataAppThemes: vi.fn().mockResolvedValue(themes),
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

    it('mirrors the rendered themes in structuredContent', async () => {
        const output = await execute(
            getListDataAppThemes({
                listDataAppThemes: vi.fn().mockResolvedValue(themes),
            }),
        );

        expect(output.structuredContent).toEqual({ count: 2, themes });
        if ('error' in output.structuredContent) {
            throw new Error('expected success structuredContent');
        }
        output.structuredContent.themes.forEach((theme) => {
            expect(output.result).toContain(
                `<theme slug="${theme.slug}" isDefault="${theme.isDefault}">`,
            );
            expect(output.result).toContain(`<name>${theme.name}</name>`);
        });
    });

    it('tells the agent to omit themeSlug when the organization has no themes', async () => {
        const output = await execute(
            getListDataAppThemes({
                listDataAppThemes: vi.fn().mockResolvedValue([]),
            }),
        );

        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.result).toContain('no themes');
        expect(output.structuredContent).toEqual({ count: 0, themes: [] });
    });

    it('returns an error envelope whose structuredContent mirrors the text', async () => {
        const output = await execute(
            getListDataAppThemes({
                listDataAppThemes: vi
                    .fn()
                    .mockRejectedValue(new Error('themes unavailable')),
            }),
        );

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Error listing themes.');
        expect(output.result).toContain('themes unavailable');
        expect(output.structuredContent).toEqual({ error: output.result });
    });
});
