import { type CustomChartType } from '@lightdash/common';
import {
    buildFindCustomChartTypesStructuredContent,
    parseFindCustomChartTypesArgs,
} from './findCustomChartTypes';

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
