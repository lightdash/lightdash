import {
    assertUnreachable,
    syncDbtProjectToolDefinition,
    type ToolSyncDbtProjectOutput,
    type ToolSyncDbtProjectStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    SyncDbtProjectFn,
    SyncDbtProjectResult,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    syncDbtProject: SyncDbtProjectFn;
    updateProgress: UpdateProgressFn;
};

const toolDefinition = syncDbtProjectToolDefinition.for('agent');

const generateResponse = (result: SyncDbtProjectResult) => (
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

const toStructuredContent = (
    result: SyncDbtProjectResult,
    text: string,
): ToolSyncDbtProjectOutput['structuredContent'] => {
    switch (result.status) {
        case 'success':
        case 'in_progress': {
            const content: ToolSyncDbtProjectStructuredContent = {
                status: result.status,
                jobUuid: result.jobUuid,
                message: result.message,
            };
            return content;
        }
        case 'error':
            return { error: text };
        default:
            return assertUnreachable(result.status, 'Unknown sync status');
    }
};

export const getSyncDbtProject = ({
    syncDbtProject,
    updateProgress,
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (args): Promise<ToolSyncDbtProjectOutput> => {
            try {
                await updateProgress('Syncing the dbt project...');

                const result = await syncDbtProject({
                    reason: args.reason,
                });
                const text = generateResponse(result).toString();

                return {
                    result: text,
                    metadata: {
                        status: result.status === 'error' ? 'error' : 'success',
                    },
                    structuredContent: toStructuredContent(result, text),
                };
            } catch (error) {
                return toolErrorOutput(error, 'Error syncing the dbt project.');
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
