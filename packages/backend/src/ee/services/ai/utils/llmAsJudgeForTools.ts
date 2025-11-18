import {
    isToolName,
    toolDashboardV2ArgsSchema,
    toolFindChartsArgsSchema,
    toolFindContentArgsSchema,
    toolFindDashboardsArgsSchema,
    toolFindExploresArgsSchemaV3,
    toolFindFieldsArgsSchema,
    toolImproveContextArgsSchema,
    type ToolName,
    toolProposeChangeArgsSchema,
    toolRunQueryArgsSchema,
    toolSearchFieldValuesArgsSchema,
    toolTableVizArgsSchema,
    toolTimeSeriesArgsSchema,
    toolVerticalBarArgsSchema,
} from '@lightdash/common';
import { generateObject } from 'ai';
import { JSONDiff } from 'autoevals';
import { compact, differenceWith } from 'lodash';
import { z } from 'zod';
import { DbAiAgentToolCall } from '../../../database/entities/ai';
import { defaultAgentOptions } from '../agents/agentV2';
import { getOpenaiGptmodel } from '../models/openai-gpt';

const TOOL_NAME_TO_DB_TOOL_NAME = {
    findExplores: 'find_explores',
    findFields: 'find_fields',
    searchFieldValues: 'search_field_values',
    findContent: 'find_content',
    findDashboards: 'find_dashboards',
    findCharts: 'find_charts',
    generateTableVizConfig: 'table',
    generateTimeSeriesVizConfig: 'time_series_chart',
    generateBarVizConfig: 'vertical_bar_chart',
    runQuery: 'query_result',
    generateDashboard: 'generate_dashboard',
    improveContext: 'improve_context',
    proposeChange: 'propose_change',
} satisfies Record<ToolName, string>;

// Explicit mapping of tool names to their schemas
const TOOL_SCHEMAS = {
    findExplores: toolFindExploresArgsSchemaV3,
    findFields: toolFindFieldsArgsSchema,
    searchFieldValues: toolSearchFieldValuesArgsSchema,
    generateBarVizConfig: toolVerticalBarArgsSchema,
    generateTableVizConfig: toolTableVizArgsSchema,
    generateTimeSeriesVizConfig: toolTimeSeriesArgsSchema,
    // TODO: agent needs to be v2 for this to work
    generateDashboard: toolDashboardV2ArgsSchema,
    findContent: toolFindContentArgsSchema,
    findDashboards: toolFindDashboardsArgsSchema,
    findCharts: toolFindChartsArgsSchema,
    improveContext: toolImproveContextArgsSchema,
    proposeChange: toolProposeChangeArgsSchema,
    runQuery: toolRunQueryArgsSchema,
} satisfies Record<ToolName, z.ZodSchema>;

const getToolInfo = (toolName: string) => {
    if (!isToolName(toolName)) {
        throw new Error(`Tool ${toolName} is not a valid tool`);
    }
    return TOOL_SCHEMAS[toolName];
};

const availableTools = Object.entries(TOOL_SCHEMAS).map(([name, schema]) => ({
    name: TOOL_NAME_TO_DB_TOOL_NAME[name as ToolName],
    description: schema.description,
}));

const availableToolsDescription = availableTools
    .map((tool) => `- ${tool.name}: ${tool.description}`)
    .join('\n');

const toolEvaluationSchema = z.object({
    effectiveness: z
        .enum(['excellent', 'good', 'adequate', 'poor', 'failed'])
        .describe('Overall effectiveness of tool usage'),
    appropriateTools: z
        .boolean()
        .describe('Whether the right tools were selected for the task'),
    validToolArgs: z
        .boolean()
        .describe(
            'Whether all tool arguments were valid according to their schemas',
        ),
    expectedArgsValidation: z
        .array(
            z.object({
                toolName: z.string(),
                matched: z.boolean(),
                errors: z.array(z.string()),
            }),
        )
        .describe(
            'Results of expected args validation for each tool (if provided)',
        ),
    rationale: z
        .string()
        .describe(
            'Combined explanation covering both effectiveness and tool selection appropriateness',
        ),
    suggestions: z
        .array(z.string())
        .describe(
            'Suggestions for improvement if effectiveness is not excellent',
        ),
    missingTools: z
        .array(z.string())
        .describe('Tools that should have been used but were not'),
    unnecessaryTools: z
        .array(z.string())
        .describe('Tools that were used but were not necessary'),
    validationErrors: z
        .array(z.string())
        .describe('Validation errors found in tool arguments'),
    passed: z
        .boolean()
        .describe(
            'Whether the tool evaluation passed (excellent/good effectiveness AND appropriate tools AND valid args AND expected args match if provided)',
        ),
});

export type ToolEvaluationResponse = z.infer<typeof toolEvaluationSchema>;

type Params = {
    prompt: string;
    toolCalls: DbAiAgentToolCall[];
    expectedOutcome: string;
    judge: ReturnType<typeof getOpenaiGptmodel>['model'];
    callOptions: ReturnType<typeof getOpenaiGptmodel>['callOptions'];
    expectedArgsValidation?: {
        toolName: string;
        expectedArgs: object;
    }[];
};

export type ToolJudgeResult = ToolEvaluationResponse & {
    timestamp: string;
    toolSequence: string[];
};

type ExpectedArgsResult = {
    toolName: string;
    matched: boolean;
    errors: string[];
};

export type ToolCallScore = {
    toolName: string;
    description: string;
    validationError: string | null;
    expectedArgsResult: ExpectedArgsResult | null;
};

export type ToolCallsScores = {
    scores: ToolCallScore[];
    validationErrors: string[];
    expectedArgsResults: ExpectedArgsResult[];
    missedValidations: ExpectedArgsResult[];
};

export const scoreToolCall = async (
    toolCall: DbAiAgentToolCall,
    index: number,
    expectedArgs?: object,
): Promise<ToolCallScore> => {
    const toolInfo = getToolInfo(toolCall.tool_name);
    const hasArgs = !!toolCall.tool_args;
    const args = hasArgs
        ? JSON.stringify(toolCall.tool_args, null, 2)
        : 'No arguments';

    let validationError = null;
    let expectedArgsResult: ExpectedArgsResult | null = null;

    if (hasArgs) {
        const valid = toolInfo.safeParse(toolCall.tool_args);
        if (!valid.success) {
            validationError = `Tool ${toolCall.tool_name}: ${valid.error.message}`;
        }
    }

    if (expectedArgs) {
        const actualArgs = toolCall.tool_args || {};

        try {
            const diff = await JSONDiff({
                output: JSON.stringify(actualArgs),
                expected: JSON.stringify(expectedArgs),
            });

            const matched = (diff.score ?? 0) >= 0.9;
            const errors = matched
                ? []
                : [`JSON diff score: ${diff.score}, expected >= 0.9`];

            expectedArgsResult = {
                toolName: toolCall.tool_name,
                matched,
                errors,
            };
        } catch (error) {
            expectedArgsResult = {
                toolName: toolCall.tool_name,
                matched: false,
                errors: [
                    `JSON comparison failed: ${
                        error instanceof Error ? error.message : 'Unknown error'
                    }`,
                ],
            };
        }
    }

    const description = `Tool Call ${index + 1}:
  Name: ${toolCall.tool_name}
  Description: ${toolInfo.description}
  Arguments: ${args}`;

    return {
        toolName: toolCall.tool_name,
        description,
        validationError,
        expectedArgsResult,
    };
};

export const scoreToolCalls = async (
    toolCalls: DbAiAgentToolCall[],
    expectedArgsValidation: { toolName: string; expectedArgs: object }[] = [],
): Promise<ToolCallsScores> => {
    const scores = await Promise.all(
        toolCalls.map(async (call, index) => {
            const expectedValidation = expectedArgsValidation.find(
                (validation) => validation.toolName === call.tool_name,
            );
            return scoreToolCall(call, index, expectedValidation?.expectedArgs);
        }),
    );

    const validationErrors = compact(
        scores.map((score) => score.validationError),
    );

    const expectedArgsResults = compact(
        scores.map((score) => score.expectedArgsResult),
    );

    const missedValidations = differenceWith(
        expectedArgsValidation,
        toolCalls,
        (validation, call) => validation.toolName === call.tool_name,
    ).map((validation) => ({
        toolName: validation.toolName,
        matched: false,
        errors: [`Tool ${validation.toolName} was not called`],
    }));

    return {
        scores,
        validationErrors,
        expectedArgsResults,
        missedValidations,
    };
};

export const evaluateToolCallSequence = async (
    prompt: string,
    expectedOutcome: string,
    toolCallsScores: ToolCallsScores,
    judge: ReturnType<typeof getOpenaiGptmodel>['model'],
    callOptions: ReturnType<typeof getOpenaiGptmodel>['callOptions'],
): Promise<ToolEvaluationResponse> => {
    const toolCallsDescription = toolCallsScores.scores
        .map((score) => score.description)
        .join('\n\n');

    const { object: evaluationResult } = await generateObject({
        model: judge,
        ...defaultAgentOptions,
        ...callOptions,
        schema: toolEvaluationSchema,
        prompt: `
You are evaluating AI agent tool usage for business logic testing. Here is the data:
[BEGIN DATA]
************
[User Prompt]: ${prompt}
************
[Expected Outcome]: ${expectedOutcome}
************
[Available Tools]:
${availableToolsDescription}
************
[Tool Calls Made]:
${toolCallsDescription}
************
[Validation Errors]: ${
            toolCallsScores.validationErrors.length > 0
                ? toolCallsScores.validationErrors.join('\n')
                : 'None'
        }
************
[Expected Args Validation]: ${
            toolCallsScores.expectedArgsResults.length > 0
                ? JSON.stringify(toolCallsScores.expectedArgsResults, null, 2)
                : 'None'
        }
************
************
[Expected Args that were not called]: ${
            toolCallsScores.missedValidations.length > 0
                ? JSON.stringify(toolCallsScores.missedValidations, null, 2)
                : 'None'
        }
************
[END DATA]

Evaluate the tool usage across three dimensions:

1. EFFECTIVENESS - How well did the tools accomplish the expected outcome?
   - excellent: Tools perfectly accomplished the expected outcome with optimal usage
   - good: Tools accomplished the expected outcome with minor inefficiencies
   - adequate: Tools accomplished the expected outcome but with some issues
   - poor: Tools partially accomplished the expected outcome with significant issues
   - failed: Tools did not accomplish the expected outcome

   Consider:
   - Did the tools accomplish the expected outcome?
   - Were the tool arguments appropriate and complete?
   - Did the tool results provide the necessary information?
   - Was the sequence logical and efficient? (e.g., find explores → find fields → generate viz)
   - Were tools called in the right order to build up context?
   - Did each tool call build upon previous results appropriately?

2. USAGE - Were appropriate tools selected?
   - Evaluate if selected tools were the best choice for the task
   - Identify any missing tools that should have been used
   - Identify any unnecessary tools that were used
   - Consider if the tool usage pattern was efficient

3. VALIDATION - Were the tool arguments valid according to their schemas?
   - Set validToolArgs to true if all tool arguments passed schema validation
   - Set validToolArgs to false if any validation errors were found
   - Include all validation errors in the validationErrors array

4. EXPECTED ARGS - Did tool arguments match expected values (if validation provided)?
   - Review the expectedArgsValidation results for each tool that was called
   - Consider both schema validity and expected value matching
   - Check the "Expected Args that were not called" section for tools that were expected but missing
   - Missing expected tools should be considered when evaluating appropriateTools and effectiveness
   - Tools that were expected but not called indicate incomplete task execution

For passed, return true if effectiveness is excellent/good AND appropriateTools is true AND validToolArgs is true AND all expected args validations passed (if provided) AND no expected tools were missed.
Use empty arrays for suggestions, missingTools, unnecessaryTools, validationErrors, and expectedArgsValidation when not applicable.
        `,
    });

    return evaluationResult;
};

export const llmAsJudgeForTools = async ({
    prompt,
    toolCalls,
    expectedOutcome,
    judge,
    callOptions,
    expectedArgsValidation = [],
}: Params): Promise<ToolJudgeResult> => {
    const toolCallsScores = await scoreToolCalls(
        toolCalls,
        expectedArgsValidation,
    );

    const evaluationResult = await evaluateToolCallSequence(
        prompt,
        expectedOutcome,
        toolCallsScores,
        judge,
        callOptions,
    );

    return {
        ...evaluationResult,
        validToolArgs: toolCallsScores.validationErrors.length === 0,
        validationErrors: toolCallsScores.validationErrors,
        expectedArgsValidation: [
            ...toolCallsScores.expectedArgsResults,
            ...toolCallsScores.missedValidations,
        ],
        timestamp: new Date().toISOString(),
        toolSequence: toolCalls.map((call) => call.tool_name),
    };
};
