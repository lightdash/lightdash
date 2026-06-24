import {
    DimensionType,
    FieldType,
    type ToolFindExploresOutput,
    type ToolFindFieldsOutput,
    type ToolSearchSemanticLayerOutput,
} from '@lightdash/common';
import { getFindExplores } from './findExplores';
import { getFindFields } from './findFields';
import { getSearchSemanticLayer } from './searchSemanticLayer';

type FindExploresTool = ReturnType<typeof getFindExplores>;
type FindFieldsTool = ReturnType<typeof getFindFields>;
type SearchSemanticLayerTool = ReturnType<typeof getSearchSemanticLayer>;

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

const executeSearchSemanticLayer = (
    tool: SearchSemanticLayerTool,
    args: Parameters<NonNullable<SearchSemanticLayerTool['execute']>>[0],
): Promise<ToolSearchSemanticLayerOutput> =>
    tool.execute!(args, {
        messages: [],
        toolCallId: 'test',
    }) as Promise<ToolSearchSemanticLayerOutput>;

const longDescription = `Important grain and usage notes. ${'x'.repeat(
    650,
)} Do not lose this final sentence.`;

describe('field discovery descriptions', () => {
    it('does not truncate explore or top matching field descriptions', async () => {
        const tool = getFindExplores({
            fieldSearchSize: 50,
            findExplores: jest.fn().mockResolvedValue({
                exploreSearchResults: [
                    {
                        name: 'tickets',
                        label: 'Tickets',
                        description: longDescription,
                        searchRank: 1,
                    },
                ],
                topMatchingFields: [
                    {
                        name: 'feature_name',
                        label: 'Feature name',
                        tableName: 'tickets',
                        fieldType: FieldType.DIMENSION,
                        description: longDescription,
                        searchRank: 1,
                        chartUsage: 0,
                    },
                ],
            }),
            updateProgress: jest.fn().mockResolvedValue(undefined),
        });

        const output = await executeFindExplores(tool, {
            searchQuery: 'feature requests',
        });

        expect(output.result).toContain(longDescription);
        expect(output.result).toContain(
            '<field name="feature_name" label="Feature name"',
        );
        expect(output.result).toContain(
            `<description>${longDescription}</description>`,
        );
        expect(output.result).not.toContain('…');
    });

    it('does not truncate findFields descriptions', async () => {
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
            getExplore: jest.fn().mockResolvedValue(explore),
            findFields: jest.fn().mockResolvedValue({
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
            updateProgress: jest.fn().mockResolvedValue(undefined),
        });

        const output = await executeFindFields(tool, {
            table: 'tickets',
            page: 1,
            fieldSearchQueries: [{ label: 'feature name' }],
        });

        expect(output.result).toContain(
            `<description>${longDescription}</description>`,
        );
        expect(output.result).not.toContain('…');
    });

    it('does not truncate searchSemanticLayer descriptions', async () => {
        const tool = getSearchSemanticLayer({
            searchSemanticLayer: jest.fn().mockResolvedValue({
                fields: [
                    {
                        name: 'feature_name',
                        label: 'Feature name',
                        tableName: 'tickets',
                        fieldType: FieldType.DIMENSION,
                        description: longDescription,
                        chartUsage: 0,
                        searchRank: 1,
                    },
                ],
                pagination: undefined,
            }),
            maxPageSize: 200,
            updateProgress: jest.fn().mockResolvedValue(undefined),
        });

        const output = await executeSearchSemanticLayer(tool, {
            page: 1,
            pageSize: 100,
            searchQuery: 'feature requests',
            type: null,
        });

        expect(output.result).toContain(
            `<description>${longDescription}</description>`,
        );
        expect(output.result).not.toContain('…');
    });
});
