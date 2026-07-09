import { improveContextToolDefinition } from '@lightdash/common';
import Logger from '../../../../logging/logger';
import { toolErrorHandler } from '../utils/toolErrorHandler';

const toolDefinition = improveContextToolDefinition.for('ai-sdk');

export const getImproveContext = () =>
    toolDefinition.build({
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
                        status: 'success' as const,
                        type: 'string' as const,
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
                            status: 'success' as const,
                        },
                    };
                }

                Logger.info(
                    `[AI Agent] Successfully got context improvement candidate:  ${toolArgs.suggestedInstruction}`,
                );

                return {
                    status: 'success' as const,
                    type: 'string' as const,
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
                        status: 'success' as const,
                    },
                };
            } catch (error) {
                return {
                    status: 'error' as const,
                    error: toolErrorHandler(error, 'Error improving context'),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
    });
