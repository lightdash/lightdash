import { z } from 'zod';
import assertUnreachable from '../../../../utils/assertUnreachable';
import {
    filterExpressionAstSchema,
    filterExpressionSpanSchema,
    type FilterExpressionAst,
    type FilterExpressionParseError,
    type FilterExpressionParseResult,
    type FilterExpressionPosition,
    type FilterExpressionSpan,
} from './ast';
import { FILTER_EXPRESSION_MIXED_CONNECTORS_CODE } from './grammar';
import { filterExpressionParser } from './parser';

export const FILTER_EXPRESSION_MAX_LENGTH = 16_384;
export const FILTER_EXPRESSION_MAX_RULES = 256;
export const FILTER_EXPRESSION_MAX_VALUES_PER_RULE = 256;
export const FILTER_EXPRESSION_MAX_LITERAL_LENGTH = 256;

const generatedMixedConnectorsResultSchema = z
    .object({
        kind: z.literal('parseError'),
        code: z.literal(FILTER_EXPRESSION_MIXED_CONNECTORS_CODE),
        message: z.string(),
        span: filterExpressionSpanSchema,
    })
    .strict();

const generatedParserOutputSchema = z.discriminatedUnion('kind', [
    filterExpressionAstSchema,
    generatedMixedConnectorsResultSchema,
]);

const generatedSyntaxErrorSchema = z.object({
    name: z.literal('SyntaxError'),
    message: z.string(),
    location: filterExpressionSpanSchema,
});

type GeneratedParserInvocation =
    | { success: true; output: unknown }
    | { success: false; error: unknown };

type GeneratedFilterExpressionResult =
    | z.infer<typeof generatedParserOutputSchema>
    | { kind: 'syntaxError'; message: string; span: FilterExpressionSpan };

const invokeGeneratedParser = (input: string): GeneratedParserInvocation => {
    try {
        return { success: true, output: filterExpressionParser.parse(input) };
    } catch (error) {
        return { success: false, error };
    }
};

const parseGeneratedFilterExpression = (
    input: string,
): GeneratedFilterExpressionResult => {
    const parserInvocation = invokeGeneratedParser(input);
    if (parserInvocation.success) {
        const output = generatedParserOutputSchema.safeParse(
            parserInvocation.output,
        );
        if (!output.success) {
            throw output.error;
        }
        return output.data;
    }

    const syntaxError = generatedSyntaxErrorSchema.safeParse(
        parserInvocation.error,
    );
    if (!syntaxError.success) {
        throw parserInvocation.error;
    }
    return {
        kind: 'syntaxError',
        message: syntaxError.data.message,
        span: syntaxError.data.location,
    };
};

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

const validateParsedFilterExpression = (
    expression: FilterExpressionAst,
): FilterExpressionParseResult => {
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
        const settingValues =
            rule.settings?.entries.map(({ value }) => value) ?? [];
        const values = [...rule.arguments, ...settingValues];
        if (values.length > FILTER_EXPRESSION_MAX_VALUES_PER_RULE) {
            const firstExcessValue =
                values[FILTER_EXPRESSION_MAX_VALUES_PER_RULE];
            return boundsError({
                message: `Filter rule exceeds the ${FILTER_EXPRESSION_MAX_VALUES_PER_RULE}-value limit.`,
                limit: 'valueCount',
                maximum: FILTER_EXPRESSION_MAX_VALUES_PER_RULE,
                actual: values.length,
                span: firstExcessValue.span,
            });
        }

        const settingNames =
            rule.settings?.entries.map(({ name }) => name) ?? [];
        const oversizedLiteral = [
            rule.field,
            ...rule.arguments,
            ...settingNames,
            ...settingValues,
        ].find(
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

    const parserResult = parseGeneratedFilterExpression(input);
    switch (parserResult.kind) {
        case 'expression':
            return validateParsedFilterExpression(parserResult);
        case 'parseError':
            return {
                success: false,
                error: {
                    code: parserResult.code,
                    message: parserResult.message,
                    span: parserResult.span,
                },
            };
        case 'syntaxError':
            return {
                success: false,
                error: {
                    code: 'FILTER_EXPRESSION_SYNTAX',
                    message: parserResult.message,
                    span: parserResult.span,
                },
            };
        default:
            return assertUnreachable(
                parserResult,
                'Unknown generated filter expression parser result',
            );
    }
};
