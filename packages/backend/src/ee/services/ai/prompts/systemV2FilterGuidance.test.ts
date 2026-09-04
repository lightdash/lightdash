import {
    FILTER_EXPRESSION_GRAMMAR_DESCRIPTION,
    FILTER_EXPRESSION_PUNCTUATED_STRING_EXAMPLE,
    parseFilterExpression,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    FILTER_EXPRESSION_GUIDANCE_SECTION,
    FILTER_EXPRESSION_PLACEMENT_EXPRESSIONS,
} from './systemV2FilterGuidance';

describe('filter expression prompt guidance', () => {
    it('includes the shared deterministic grammar exactly once', () => {
        expect(
            FILTER_EXPRESSION_GUIDANCE_SECTION.split(
                FILTER_EXPRESSION_GRAMMAR_DESCRIPTION,
            ),
        ).toHaveLength(2);
    });

    it('keeps placement examples parseable', () => {
        for (const expression of Object.values(
            FILTER_EXPRESSION_PLACEMENT_EXPRESSIONS,
        )) {
            expect(parseFilterExpression(expression)).toMatchObject({
                success: true,
            });
        }
    });

    it('includes the canonical punctuated-string example exactly once', () => {
        expect(
            FILTER_EXPRESSION_GUIDANCE_SECTION.split(
                FILTER_EXPRESSION_PUNCTUATED_STRING_EXAMPLE,
            ),
        ).toHaveLength(2);
        expect(
            parseFilterExpression(FILTER_EXPRESSION_PUNCTUATED_STRING_EXAMPLE),
        ).toMatchObject({ success: true });
    });
});
