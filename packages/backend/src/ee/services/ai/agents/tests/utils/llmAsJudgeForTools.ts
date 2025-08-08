import { AgentToolCallArgsSchema } from '@lightdash/common';
import { generateObject } from 'ai';
import { JSONDiff } from 'autoevals';
import { compact, differenceWith } from 'lodash';
import { z } from 'zod';
import { DbAiAgentToolCall } from '../../../../../database/entities/ai';
import { getOpenaiGptmodel } from '../../../models/openai-gpt';
import { defaultAgentOptions } from '../../agent';

const dbToolToToolName = (dbToolName: string) => {
    switch (dbToolName) {
        case 'findExplores':
            return 'find_explores';
        case 'findFields':
            return 'find_fields';
        case 'findDashboards':
            return 'find_dashboards';
        case 'findCharts':
            return 'find_charts';
        case 'generateTableVizConfig':
            return 'table';
        case 'generateTimeSeriesVizConfig':
            return 'time_series_chart';
        case 'generateBarVizConfig':
            return 'vertical_bar_chart';
        default:
            throw new Error(`Unknown tool name: ${dbToolName}`);
    }
};

const getToolInfo = (toolName: string) => {
    const tool = AgentToolCallArgsSchema.options.find(
        (schema) => schema.shape.type.value === dbToolToToolName(toolName),
    );
    if (!tool) {
        throw new Error(`Tool info not found for tool: ${toolName}`);
    }

    return tool;
};

const availableTools = AgentToolCallArgsSchema.options.map((schema) => ({
    name: schema.shape.type.value,
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
    query: string;
    toolCalls: DbAiAgentToolCall[];
    expectedOutcome: string;
    model: ReturnType<typeof getOpenaiGptmodel>;
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

export const llmAsJudgeForTools = async ({
    query,
    toolCalls,
    expectedOutcome,
    model,
    expectedArgsValidation = [],
}: Params): Promise<ToolJudgeResult> => {
    // Process each tool call: schema validation, expected args validation, and description generation
    const toolCallsProcessingResults = await Promise.all(
        toolCalls.map(async (call, index) => {
            const toolInfo = getToolInfo(call.tool_name);
            const hasArgs = !!call.tool_args;
            const args = hasArgs
                ? JSON.stringify(call.tool_args, null, 2)
                : 'No arguments';

            let validationError = null;
            let expectedArgsResult: ExpectedArgsResult | null = null;

            if (hasArgs) {
                const valid = toolInfo.safeParse(call.tool_args);
                if (!valid.success) {
                    validationError = `Tool ${call.tool_name}: ${valid.error.message}`;
                }
            }

            const expectedValidation = expectedArgsValidation.find(
                (validation) => validation.toolName === call.tool_name,
            );

            if (expectedValidation) {
                const actualArgs = call.tool_args || {};

                try {
                    const diff = await JSONDiff({
                        output: JSON.stringify(actualArgs),
                        expected: JSON.stringify(
                            expectedValidation.expectedArgs,
                        ),
                    });

                    const matched = (diff.score ?? 0) >= 0.9;
                    const errors = matched
                        ? []
                        : [`JSON diff score: ${diff.score}, expected >= 0.9`];

                    expectedArgsResult = {
                        toolName: call.tool_name,
                        matched,
                        errors,
                    };
                } catch (error) {
                    expectedArgsResult = {
                        toolName: call.tool_name,
                        matched: false,
                        errors: [
                            `JSON comparison failed: ${
                                error instanceof Error
                                    ? error.message
                                    : 'Unknown error'
                            }`,
                        ],
                    };
                }
            }

            const description = `Tool Call ${index + 1}:
  Name: ${call.tool_name}
  Description: ${toolInfo.description}
  Arguments: ${args}`;

            return {
                description,
                validationError,
                expectedArgsResult,
            };
        }),
    );

    const expectedArgsResults = compact(
        toolCallsProcessingResults.map((result) => result.expectedArgsResult),
    );

    const validationErrors = compact(
        toolCallsProcessingResults.map((result) => result.validationError),
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

    const toolCallsDescription = toolCallsProcessingResults
        .map((result) => result.description)
        .join('\n\n');

    const { object: evaluationResult } = await generateObject({
        model,
        ...defaultAgentOptions,
        schema: toolEvaluationSchema,
        prompt: `
You are evaluating AI agent tool usage for business logic testing. Here is the data:
[BEGIN DATA]
************
[User Query]: ${query}
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
            validationErrors.length > 0 ? validationErrors.join('\n') : 'None'
        }
************
[Expected Args Validation]: ${
            expectedArgsResults.length > 0
                ? JSON.stringify(expectedArgsResults, null, 2)
                : 'None'
        }
************
************
[Expected Args that were not called]: ${
            missedValidations.length > 0
                ? JSON.stringify(missedValidations, null, 2)
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

    return {
        ...evaluationResult,
        validToolArgs: validationErrors.length === 0,
        validationErrors,
        expectedArgsValidation: [...expectedArgsResults, ...missedValidations],
        timestamp: new Date().toISOString(),
        toolSequence: toolCalls.map((call) => call.tool_name),
    };
};
