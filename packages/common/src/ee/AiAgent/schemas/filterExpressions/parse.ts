import { z } from 'zod';
import {
    filterExpressionAstSchema,
    filterExpressionSpanSchema,
    type FilterExpressionParseError,
    type FilterExpressionParseResult,
    type FilterExpressionPosition,
    type FilterExpressionSpan,
} from './ast';
import { FILTER_EXPRESSION_MIXED_CONNECTORS_MESSAGE } from './grammar';
import { filterExpressionParser } from './parser';

export const FILTER_EXPRESSION_MAX_LENGTH = 16_384;
export const FILTER_EXPRESSION_MAX_RULES = 100;
export const FILTER_EXPRESSION_MAX_VALUES_PER_RULE = 100;
export const FILTER_EXPRESSION_MAX_LITERAL_LENGTH = 4_096;

const generatedSyntaxErrorSchema = z.object({
    message: z.string(),
    location: filterExpressionSpanSchema,
});

const getPositionAtOffset = (
    input: string,
    requestedOffset: number,
): FilterExpressionPosition => {
    const offset = Math.max(0, Math.min(requestedOffset, input.length));
    let line = 1;
    let column = 1;

    for (let index = 0; index < offset; index += 1) {
        if (input[index] === '\n') {
            line += 1;
            column = 1;
        } else {
            column += 1;
        }
    }

    return { offset, line, column };
};

const getSpanAtOffset = (
    input: string,
    offset: number,
): FilterExpressionSpan => ({
    start: getPositionAtOffset(input, offset),
    end: getPositionAtOffset(input, Math.min(offset + 1, input.length)),
});

const boundsError = ({
    message,
    limit,
    maximum,
    actual,
    span,
}: Omit<
    Extract<
        FilterExpressionParseError,
        { code: 'FILTER_EXPRESSION_BOUNDS_EXCEEDED' }
    >,
    'code'
>): FilterExpressionParseResult => ({
    success: false,
    error: {
        code: 'FILTER_EXPRESSION_BOUNDS_EXCEEDED',
        message,
        limit,
        maximum,
        actual,
        span,
    },
});

export const parseFilterExpression = (
    input: string,
): FilterExpressionParseResult => {
    if (input.length > FILTER_EXPRESSION_MAX_LENGTH) {
        return boundsError({
            message: `Filter expression exceeds the ${FILTER_EXPRESSION_MAX_LENGTH}-character limit.`,
            limit: 'expressionLength',
            maximum: FILTER_EXPRESSION_MAX_LENGTH,
            actual: input.length,
            span: getSpanAtOffset(input, FILTER_EXPRESSION_MAX_LENGTH),
        });
    }

    let parsed: unknown;
    try {
        parsed = filterExpressionParser.parse(input);
    } catch (error) {
        const syntaxError = generatedSyntaxErrorSchema.safeParse(error);
        if (!syntaxError.success) {
            throw error;
        }

        return {
            success: false,
            error: {
                code:
                    syntaxError.data.message ===
                    FILTER_EXPRESSION_MIXED_CONNECTORS_MESSAGE
                        ? 'FILTER_EXPRESSION_MIXED_CONNECTORS'
                        : 'FILTER_EXPRESSION_SYNTAX',
                message: syntaxError.data.message,
                span: syntaxError.data.location,
            },
        };
    }

    const expression = filterExpressionAstSchema.parse(parsed);

    if (expression.rules.length > FILTER_EXPRESSION_MAX_RULES) {
        const firstExcessRule = expression.rules[FILTER_EXPRESSION_MAX_RULES];
        return boundsError({
            message: `Filter expression exceeds the ${FILTER_EXPRESSION_MAX_RULES}-rule limit.`,
            limit: 'ruleCount',
            maximum: FILTER_EXPRESSION_MAX_RULES,
            actual: expression.rules.length,
            span: firstExcessRule.span,
        });
    }

    for (const rule of expression.rules) {
        if (rule.arguments.length > FILTER_EXPRESSION_MAX_VALUES_PER_RULE) {
            const firstExcessValue =
                rule.arguments[FILTER_EXPRESSION_MAX_VALUES_PER_RULE];
            return boundsError({
                message: `Filter rule exceeds the ${FILTER_EXPRESSION_MAX_VALUES_PER_RULE}-value limit.`,
                limit: 'valueCount',
                maximum: FILTER_EXPRESSION_MAX_VALUES_PER_RULE,
                actual: rule.arguments.length,
                span: firstExcessValue.span,
            });
        }

        const oversizedLiteral = [rule.field, ...rule.arguments].find(
            ({ value }) => value.length > FILTER_EXPRESSION_MAX_LITERAL_LENGTH,
        );
        if (oversizedLiteral) {
            return boundsError({
                message: `Filter literal exceeds the ${FILTER_EXPRESSION_MAX_LITERAL_LENGTH}-character limit.`,
                limit: 'literalLength',
                maximum: FILTER_EXPRESSION_MAX_LITERAL_LENGTH,
                actual: oversizedLiteral.value.length,
                span: oversizedLiteral.span,
            });
        }
    }

    return { success: true, expression };
};
