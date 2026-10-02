import {
    compileGenerativeUiSpec,
    generateUiToolDefinition,
    generativeUiActionOutcomeSchema,
    type ToolGenerateUiOutput,
} from '@lightdash/common';
import { tool } from 'ai';
import type { ApiOperationCatalog } from '../generativeUi/apiOperationCatalog';
import {
    generateUiErrorOutput,
    toGenerateUiToolOutput,
} from '../generativeUi/generativeUiOutcome';
import type { FindToolUserInputFn } from '../types/aiAgentDependencies';

type Dependencies = {
    catalog: ApiOperationCatalog;
    projectUuid: string;
    findToolUserInput: FindToolUserInputFn;
};

const toolDefinition = generateUiToolDefinition.for('agent');

export const getGenerateUi = ({
    catalog,
    projectUuid,
    findToolUserInput,
}: Dependencies) => {
    const context = {
        operations: new Map(
            catalog
                .listForClient()
                .map((operation) => [operation.operationId, operation]),
        ),
        projectUuid,
    };

    return tool({
        ...toolDefinition,
        // A valid card halts the run until the user acts on it; an invalid
        // one runs at once so the model sees every problem.
        needsApproval: (spec) => compileGenerativeUiSpec(spec, context).ok,
        execute: async (
            spec,
            { toolCallId },
        ): Promise<ToolGenerateUiOutput> => {
            const compiled = compileGenerativeUiSpec(spec, context);
            if (!compiled.ok) {
                return generateUiErrorOutput(
                    [
                        'The card was not shown:',
                        ...compiled.problems.map((problem) => `- ${problem}`),
                        'Fix the spec and call generateUi again.',
                    ].join('\n'),
                );
            }
            const input = await findToolUserInput(toolCallId);
            const outcome =
                input === null
                    ? null
                    : generativeUiActionOutcomeSchema.safeParse(input.input);
            if (outcome === null || !outcome.success) {
                return generateUiErrorOutput(
                    'No outcome was recorded for this card. Do not render it again unless the user asks.',
                );
            }
            return toGenerateUiToolOutput(outcome.data);
        },
    });
};
