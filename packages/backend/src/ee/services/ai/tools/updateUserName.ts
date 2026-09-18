import {
    updateUserNameToolDefinition,
    type ToolUpdateUserNameStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { UpdateUserNameFn } from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    updateUserName: UpdateUserNameFn;
};

const toolDefinition = updateUserNameToolDefinition.for('agent');

type UpdateUserNameSuccess = ExecuteStructuredToolResult<
    ToolUpdateUserNameStructuredContent,
    { status: 'success'; fullName: string }
>;

export const getUpdateUserName = ({ updateUserName }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (
            args,
        ): Promise<UpdateUserNameSuccess | ExecuteToolErrorResult> => {
            const firstName = args.firstName.trim();
            const lastName = args.lastName.trim();
            const structuredContent: ToolUpdateUserNameStructuredContent = {
                fullName: `${firstName} ${lastName}`,
            };

            try {
                await updateUserName({ firstName, lastName });

                return {
                    result: `User name updated to "${structuredContent.fullName}".`,
                    metadata: {
                        status: 'success',
                        fullName: structuredContent.fullName,
                    },
                    structuredContent,
                };
            } catch (error) {
                return toolErrorOutput(error, 'Error updating user name.');
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
