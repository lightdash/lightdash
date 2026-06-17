import { syncDbtProjectToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type {
    SyncDbtProjectFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    syncDbtProject: SyncDbtProjectFn;
    updateProgress: UpdateProgressFn;
};

const toolDefinition = syncDbtProjectToolDefinition.for('agent');

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
    tool({
        ...toolDefinition,
        execute: async (args) => {
            try {
                await updateProgress('Syncing the dbt project...');

                const result = await syncDbtProject({
                    reason: args.reason,
                });

                return {
                    result: generateResponse(result).toString(),
                    metadata: {
                        status: result.status === 'error' ? 'error' : 'success',
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        'Error syncing the dbt project.',
                    ),
                    metadata: {
                        status: 'error',
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
