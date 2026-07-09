import { syncDbtProjectToolDefinition } from '@lightdash/common';
import type {
    SyncDbtProjectFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    syncDbtProject: SyncDbtProjectFn;
    updateProgress: UpdateProgressFn;
};

const toolDefinition = syncDbtProjectToolDefinition.for('ai-sdk');

const generateResponse = (result: Awaited<ReturnType<SyncDbtProjectFn>>) => (
    <syncDbtProject status={result.status} jobUuid={result.jobUuid}>
        <message>{result.message}</message>
        {result.status === 'success' && (
            <note>
                The dbt project has been recompiled — any newly merged or
                changed fields are now live in the explores. You can build or
                verify content that uses them.
            </note>
        )}
        {result.status === 'in_progress' && (
            <note>
                The compile is still running. Tell the user the project is still
                syncing and to retry shortly; do not assume the new fields are
                available yet.
            </note>
        )}
    </syncDbtProject>
);

export const getSyncDbtProject = ({
    syncDbtProject,
    updateProgress,
}: Dependencies) =>
    toolDefinition.build({
        execute: async (args) => {
            try {
                await updateProgress('Syncing the dbt project...');

                const result = await syncDbtProject({
                    reason: args.reason,
                });
                const response = generateResponse(result).toString();

                if (result.status === 'error') {
                    return {
                        status: 'error' as const,
                        error: response,
                        metadata: {
                            status: 'error' as const,
                        },
                    };
                }

                return {
                    status: 'success' as const,
                    type: 'string' as const,
                    result: response,
                    metadata: {
                        status: 'success' as const,
                    },
                };
            } catch (error) {
                return {
                    status: 'error' as const,
                    error: toolErrorHandler(
                        error,
                        'Error syncing the dbt project.',
                    ),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
    });
