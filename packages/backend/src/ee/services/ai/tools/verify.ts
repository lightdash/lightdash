import {
    assertUnreachable,
    verifyToolDefinition,
    type ToolVerifyStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import {
    quoteCompileOutput,
    type BranchCompileCheck,
} from '../../SemanticStudioService/branchCompileCheck';
import type { VerifyFn } from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    verify: VerifyFn;
};

const toolDefinition = verifyToolDefinition.for('agent');

export const describeCheck = (check: BranchCompileCheck): string => {
    switch (check.status) {
        case 'ready':
            return check.exploreErrors.length === 0
                ? 'The pull request branch compiled and every model loaded.'
                : [
                      'The pull request branch compiled, but these models failed to load. Fix them with write, then check again.',
                      quoteCompileOutput(
                          check.exploreErrors
                              .map(
                                  ({ name, errors }) =>
                                      `${name}: ${errors.join('; ')}`,
                              )
                              .join('\n'),
                      ),
                  ].join('\n');
        case 'failed':
            return [
                'The compile of the pull request branch failed. Its output is between the markers below. Fix the cause with write, then check again.',
                quoteCompileOutput(check.error),
            ].join('\n');
        case 'saving':
            return 'Your save is still being written to the pull request after a minute. Tell the person the check is still running; if the compile fails, its error is sent to you.';
        case 'compiling':
            return 'The pull request branch is still compiling after a minute. Tell the person the check is still running; if the compile fails, its error is sent to you.';
        case 'nothing_saved':
            return 'This conversation has saved no change to a pull request, so there is nothing to check. Save the change with write first.';
        case 'unavailable':
            return 'This project does not save changes to a pull request, so there is no branch compile to check.';
        default:
            return assertUnreachable(check, 'Unknown branch compile check');
    }
};

export const getVerify = ({ verify }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({
            check,
        }): Promise<
            | ExecuteStructuredToolResult<ToolVerifyStructuredContent>
            | ExecuteToolErrorResult
        > => {
            try {
                const result = await verify({ check });
                return {
                    result: describeCheck(result),
                    metadata: { status: 'success' },
                    structuredContent: {
                        status: result.status,
                        modelErrorCount:
                            result.status === 'ready'
                                ? result.exploreErrors.length
                                : 0,
                    },
                };
            } catch (error) {
                return toolErrorOutput(error, 'Error checking the change.');
            }
        },
    });
