import {
    toolImproveContextArgsSchema,
    toolImproveContextOutputSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import Logger from '../../../../logging/logger';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

export const getImproveContext = () =>
    tool({
        description: toolImproveContextArgsSchema.description,
        inputSchema: toolImproveContextArgsSchema,
        outputSchema: toolImproveContextOutputSchema,
        execute: async (toolArgs) => {
            try {
                Logger.debug(`[AI Agent] Attempting to improve context:
                    Original: ${toolArgs.originalQuery}
                    Incorrect: ${toolArgs.incorrectResponse}
                    Correct: ${toolArgs.correctResponse}
                    Category: ${toolArgs.category}
                    Confidence: ${toolArgs.confidence}`);

                if (toolArgs.confidence < 0.7) {
                    Logger.debug(
                        '[AI Agent] Confidence too low to improve context',
                    );
                    return {
                        result: `\
<InstructionLearned>
    <Status>rejected</Status>
    <Reason>confidence_too_low</Reason>
    <Message>
        Context improved but confidence too low to
        create permanent instruction
    </Message>
</InstructionLearned>`.trim(),
                        metadata: {
                            status: 'success',
                        },
                    };
                }

                Logger.info(
                    `[AI Agent] Successfully got context improvement candidate:  ${toolArgs.suggestedInstruction}`,
                );

                return {
                    result: `\
<InstructionLearned>
    <Status>learned</Status>
    <Instruction>
        ${toolArgs.suggestedInstruction}
    </Instruction>
    <Category>${toolArgs.category}</Category>
    <Confidence>${toolArgs.confidence}</Confidence>
</InstructionLearned>`.trim(),
                    metadata: {
                        status: 'success',
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(error, 'Error improving context'),
                    metadata: {
                        status: 'error',
                    },
                };
            }
        },
        toModelOutput: (output) => toModelOutput(output),
    });
