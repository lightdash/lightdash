import { toolImproveContextArgsSchema } from '@lightdash/common';
import { tool } from 'ai';
import Logger from '../../../../logging/logger';
import { toolErrorHandler } from '../utils/toolErrorHandler';

export const getImproveContext = () =>
    tool({
        description: toolImproveContextArgsSchema.description,
        inputSchema: toolImproveContextArgsSchema,
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
                    return `
                        <InstructionLearned>
                            <Status>rejected</Status>
                            <Reason>confidence_too_low</Reason>
                            <Message>
                                Context improved but confidence too low to
                                create permanent instruction
                            </Message>
                        </InstructionLearned>
                    )`.trim();
                }

                Logger.info(
                    `[AI Agent] Successfully got context improvement candidate:  ${toolArgs.suggestedInstruction}`,
                );

                return `
                    <InstructionLearned>
                        <Status>learned</Status>
                        <Instruction>
                            ${toolArgs.suggestedInstruction}
                        </Instruction>
                        <Category>${toolArgs.category}</Category>
                        <Confidence>${toolArgs.confidence}</Confidence>
                    </InstructionLearned>`.trim();
            } catch (error) {
                return toolErrorHandler(error, 'Error improving context');
            }
        },
    });
