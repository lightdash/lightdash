import {
    FILTER_EXPRESSION_GRAMMAR_DESCRIPTION,
    FILTER_EXPRESSION_PUNCTUATED_STRING_EXAMPLE,
    parseFilterExpression,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    FILTER_EXPRESSION_GUIDANCE_SECTION,
    FILTER_EXPRESSION_PLACEMENT_EXPRESSIONS,
    MCP_FILTER_EXPRESSION_GUIDANCE_SECTION,
} from './filterGuidance';

describe('filter expression prompt guidance', () => {
    it.each([
        ['Agent', FILTER_EXPRESSION_GUIDANCE_SECTION],
        ['MCP', MCP_FILTER_EXPRESSION_GUIDANCE_SECTION],
    ])(
        'includes the shared deterministic grammar once for %s',
        (_, guidance) => {
            expect(
                guidance.split(FILTER_EXPRESSION_GRAMMAR_DESCRIPTION),
            ).toHaveLength(2);
        },
    );

    it('keeps placement examples parseable', () => {
        for (const expression of Object.values(
            FILTER_EXPRESSION_PLACEMENT_EXPRESSIONS,
        )) {
            expect(parseFilterExpression(expression)).toMatchObject({
                success: true,
            });
        }
    });

    it.each([
        ['Agent', FILTER_EXPRESSION_GUIDANCE_SECTION],
        ['MCP', MCP_FILTER_EXPRESSION_GUIDANCE_SECTION],
    ])(
        'includes the canonical punctuated-string example once for %s',
        (_, guidance) => {
            expect(
                guidance.split(FILTER_EXPRESSION_PUNCTUATED_STRING_EXAMPLE),
            ).toHaveLength(2);
        },
    );

    it('uses runtime-specific tool names around shared guidance', () => {
        expect(FILTER_EXPRESSION_GUIDANCE_SECTION).toContain(
            '`generateVisualization`',
        );
        expect(FILTER_EXPRESSION_GUIDANCE_SECTION).toContain(
            '`searchFieldValues.filters`',
        );
        expect(MCP_FILTER_EXPRESSION_GUIDANCE_SECTION).toContain(
            '`run_metric_query`',
        );
        expect(MCP_FILTER_EXPRESSION_GUIDANCE_SECTION).toContain(
            '`search_field_values.filters`',
        );
    });

    it('keeps the punctuated-string example parseable', () => {
        expect(
            parseFilterExpression(FILTER_EXPRESSION_PUNCTUATED_STRING_EXAMPLE),
        ).toMatchObject({ success: true });
    });
});
