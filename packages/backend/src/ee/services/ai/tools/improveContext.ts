import { toolImproveContextArgsSchema } from '@lightdash/common';
import { tool } from 'ai';
import Logger from '../../../../logging/logger';
import type { AppendInstructionFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    appendInstruction: AppendInstructionFn;
    projectUuid: string;
    agentUuid: string;
    userId: string;
    organizationId: string;
};

export const getImproveContext = ({
    appendInstruction,
    projectUuid,
    agentUuid,
    userId,
}: Dependencies) =>
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

                const instructionResult = await appendInstruction({
                    projectUuid,
                    agentUuid,
                    instruction: toolArgs.suggestedInstruction,
                    metadata: {
                        originalQuery: toolArgs.originalQuery,
                        incorrectResponse: toolArgs.incorrectResponse,
                        correctResponse: toolArgs.correctResponse,
                        category: toolArgs.category,
                        confidence: toolArgs.confidence,
                        createdByUserId: userId,
                        createdAt: new Date().toISOString(),
                    },
                });

                Logger.info(
                    `[AI Agent] Successfully improved context. ${instructionResult}`,
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
