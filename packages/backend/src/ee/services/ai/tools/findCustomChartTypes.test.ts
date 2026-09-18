import {
    toolFindCustomChartTypesOutputSchema,
    type CustomChartType,
    type ToolFindCustomChartTypesArgs,
} from '@lightdash/common';
import { type ToolExecutionOptions } from 'ai';
import { type FindCustomChartTypesFn } from '../types/aiAgentDependencies';
import {
    buildFindCustomChartTypesStructuredContent,
    getFindCustomChartTypes,
    parseFindCustomChartTypesArgs,
} from './findCustomChartTypes';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const match: CustomChartType = {
    slug: 'cohort-waterfall',
    name: 'Cohort Waterfall',
    description: 'Retention by cohort',
    schema: {
        fields: [
            {
                name: 'cohort',
                label: 'Cohort',
                type: 'dimension',
                required: true,
            },
        ],
        configOptions: [],
        colorPalette: null,
    },
};

const options: ToolExecutionOptions = { toolCallId: 'call', messages: [] };

const executeTool = async (
    findCustomChartTypes: FindCustomChartTypesFn,
    args: ToolFindCustomChartTypesArgs,
) => {
    const tool = getFindCustomChartTypes({
        findCustomChartTypes,
        updateProgress: vi.fn().mockResolvedValue(undefined),
    });
    if (!tool.execute) {
        throw new Error('Missing executor');
    }
    const output = await tool.execute(args, options);
    if (Symbol.asyncIterator in output) {
        throw new Error('Expected a non-streaming tool result');
    }
    return output;
};

describe('parseFindCustomChartTypesArgs', () => {
    test('accepts exactly one of query or slug', () => {
        expect(
            parseFindCustomChartTypesArgs({ query: 'waterfall', slug: null }),
        ).toEqual({ query: 'waterfall' });
        expect(
            parseFindCustomChartTypesArgs({
                query: null,
                slug: 'cohort-waterfall',
            }),
        ).toEqual({ slug: 'cohort-waterfall' });
    });

    test('rejects both, neither, and blank values', () => {
        expect(
            parseFindCustomChartTypesArgs({ query: 'a', slug: 'b' }),
        ).toBeNull();
        expect(
            parseFindCustomChartTypesArgs({ query: null, slug: null }),
        ).toBeNull();
        expect(
            parseFindCustomChartTypesArgs({ query: '  ', slug: null }),
        ).toBeNull();
    });
});

describe('buildFindCustomChartTypesStructuredContent', () => {
    test('returns matches with slug and full serialized schema', () => {
        const content = buildFindCustomChartTypesStructuredContent(
            { query: 'waterfall' },
            [match],
        );
        expect(content.matches.count).toBe(1);
        expect(content.matches.results[0].slug).toBe('cohort-waterfall');
        expect(content.matches.results[0].schema).toContain(
            'slug: cohort-waterfall',
        );
        expect(content.matches.results[0].schema).toContain(
            '- cohort "Cohort" (dimension, required)',
        );
    });

    test('explains an unknown slug', () => {
        const content = buildFindCustomChartTypesStructuredContent(
            { slug: 'nope' },
            [],
        );
        expect(content.matches.note).toContain(
            'No custom chart type with slug "nope"',
        );
    });

    test('suggests retrying an empty query search', () => {
        const content = buildFindCustomChartTypesStructuredContent(
            { query: 'zzz' },
            [],
        );
        expect(content.matches.note).toContain('No custom chart type matched');
    });
});

describe('getFindCustomChartTypes execute', () => {
    test('returns the matches as text and as structured content', async () => {
        const output = await executeTool(
            vi.fn<FindCustomChartTypesFn>().mockResolvedValue([match]),
            {
                query: 'waterfall',
                slug: null,
            },
        );

        expect(
            toolFindCustomChartTypesOutputSchema.safeParse(output).success,
        ).toBe(true);
        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.structuredContent).toEqual(
            buildFindCustomChartTypesStructuredContent({ query: 'waterfall' }, [
                match,
            ]),
        );
        expect(JSON.parse(output.result)).toEqual(output.structuredContent);
        expect(output.result).toContain('"slug": "cohort-waterfall"');
    });

    test('reports no results for an unknown slug', async () => {
        const output = await executeTool(
            vi.fn<FindCustomChartTypesFn>().mockResolvedValue([]),
            {
                query: null,
                slug: 'nope',
            },
        );

        expect(
            toolFindCustomChartTypesOutputSchema.safeParse(output).success,
        ).toBe(true);
        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.structuredContent).toEqual({
            request: { slug: 'nope' },
            matches: {
                count: 0,
                note: 'No custom chart type with slug "nope" exists in this project. Search by query to discover the available slugs.',
                results: [],
            },
        });
        expect(JSON.parse(output.result)).toEqual(output.structuredContent);
    });

    test('rejects setting both query and slug with a mirrored error', async () => {
        const findCustomChartTypes = vi.fn<FindCustomChartTypesFn>();
        const output = await executeTool(findCustomChartTypes, {
            query: 'a',
            slug: 'b',
        });

        expect(findCustomChartTypes).not.toHaveBeenCalled();
        expect(
            toolFindCustomChartTypesOutputSchema.safeParse(output).success,
        ).toBe(true);
        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(output.result).toContain('Set exactly one of `query`');
    });

    test('mirrors a thrown error into structured content', async () => {
        const output = await executeTool(
            vi
                .fn<FindCustomChartTypesFn>()
                .mockRejectedValue(new Error('library unavailable')),
            { query: 'waterfall', slug: null },
        );

        expect(
            toolFindCustomChartTypesOutputSchema.safeParse(output).success,
        ).toBe(true);
        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(output.result).toContain('Error finding custom chart types.');
        expect(output.result).toContain('library unavailable');
    });
});
