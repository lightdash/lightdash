import {
    DimensionType,
    FieldType,
    type ToolFindExploresOutput,
    type ToolFindFieldsOutput,
} from '@lightdash/common';
import { getFindExplores } from './findExplores';
import { getFindFields } from './findFields';

type FindExploresTool = ReturnType<typeof getFindExplores>;
type FindFieldsTool = ReturnType<typeof getFindFields>;

const executeFindExplores = (
    tool: FindExploresTool,
    args: Parameters<NonNullable<FindExploresTool['execute']>>[0],
): Promise<ToolFindExploresOutput> =>
    tool.execute!(args, {
        messages: [],
        toolCallId: 'test',
    }) as Promise<ToolFindExploresOutput>;

const executeFindFields = (
    tool: FindFieldsTool,
    args: Parameters<NonNullable<FindFieldsTool['execute']>>[0],
): Promise<ToolFindFieldsOutput> =>
    tool.execute!(args, {
        messages: [],
        toolCallId: 'test',
    }) as Promise<ToolFindFieldsOutput>;

const longDescription = `Important grain and usage notes. ${'x'.repeat(
    650,
)} Do not lose this final sentence.`;

describe('field discovery descriptions', () => {
    it('does not truncate explore descriptions and includes compact field ids only', async () => {
        const tool = getFindExplores({
            findExplores: vi.fn().mockResolvedValue({
                exploreSearchResults: [
                    {
                        name: 'tickets',
                        label: 'Tickets',
                        description: longDescription,
                        searchRank: 1,
                        joinedTables: ['users'],
                        requiredFilters: [],
                        fields: {
                            dimensions: ['tickets_feature_name'],
                            metrics: ['tickets_count'],
                        },
                    },
                ],
            }),
            updateProgress: vi.fn().mockResolvedValue(undefined),
        });

        const output = await executeFindExplores(tool, {
            searchQuery: 'feature requests',
        });
        const result = JSON.parse(output.result);

        expect(result.explores[0].description).toEqual(longDescription);
        expect(result.explores[0].dimensions).toEqual(['tickets_feature_name']);
        expect(result.explores[0].metrics).toEqual(['tickets_count']);
        expect(output.result).not.toContain('topMatchingFields');
        expect(output.result).not.toContain('Explore-only catalog search');
    });

    it('returns full descriptions from findFields', async () => {
        const explore = {
            name: 'tickets',
            baseTable: 'tickets',
            joinedTables: [],
            tables: {
                tickets: {
                    dimensions: {},
                },
            },
        };

        const tool = getFindFields({
            getExplore: vi.fn().mockResolvedValue(explore),
            findFields: vi.fn().mockResolvedValue({
                fields: [
                    {
                        name: 'feature_name',
                        label: 'Feature name',
                        tableName: 'tickets',
                        fieldType: FieldType.DIMENSION,
                        fieldValueType: DimensionType.STRING,
                        description: longDescription,
                        searchRank: 1,
                        chartUsage: 0,
                    },
                ],
                pagination: undefined,
            }),
            pageSize: 30,
            updateProgress: vi.fn().mockResolvedValue(undefined),
        });

        const output = await executeFindFields(tool, {
            table: 'tickets',
            page: 1,
            fieldSearchQueries: [{ label: 'feature name' }],
        });
        const result = JSON.parse(output.result);

        expect(result.searchResults[0].fields[0].description).toEqual(
            longDescription,
        );
    });
});
