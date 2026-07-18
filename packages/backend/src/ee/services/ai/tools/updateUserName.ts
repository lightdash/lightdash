import { updateUserNameToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type { UpdateUserNameFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    updateUserName: UpdateUserNameFn;
};

const toolDefinition = updateUserNameToolDefinition.for('agent');

export const getUpdateUserName = ({ updateUserName }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (args) => {
            const firstName = args.firstName.trim();
            const lastName = args.lastName.trim();
            const fullName = `${firstName} ${lastName}`;

            try {
                await updateUserName({ firstName, lastName });

                return {
                    result: `User name updated to "${fullName}".`,
                    metadata: {
                        status: 'success' as const,
                        fullName,
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        'Error updating user name.',
                    ),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
