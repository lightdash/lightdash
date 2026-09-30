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
    status: 'success' | 'in_progress',
    result: SyncDbtProjectResult,
): ToolSyncDbtProjectStructuredContent => {
    switch (status) {
        case 'success':
        case 'in_progress':
            return {
                status,
                jobUuid: result.jobUuid,
                message: result.message,
            };
        default:
            return assertUnreachable(status, 'Unknown sync status');
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

                if (result.status === 'error') {
                    return {
                        result: text,
                        metadata: { status: 'error' as const },
                        structuredContent: { error: text },
                    };
                }

                return {
                    result: text,
                    metadata: { status: 'success' as const },
                    structuredContent: toStructuredContent(
                        result.status,
                        result,
                    ),
                };
            } catch (error) {
                return toolErrorOutput(error, 'Error syncing the dbt project.');
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
