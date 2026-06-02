import {
    loadProjectContextToolDefinition,
    type ProjectContextEntry,
} from '@lightdash/common';
import { tool } from 'ai';
import Logger from '../../../../logging/logger';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

const renderEntries = (entries: ProjectContextEntry[]): string => {
    if (entries.length === 0) {
        return 'No project context is configured for this project.';
    }
    return entries
        .map((entry) => {
            const terms =
                entry.terms.length > 0
                    ? ` terms: ${entry.terms.join(', ')};`
                    : '';
            const refs =
                entry.objects.length > 0
                    ? ` refs: ${entry.objects.join(', ')};`
                    : '';
            const prefix = `- id: ${entry.id}; kind: ${entry.kind};${terms}${refs}`;
            return `${prefix} content: ${entry.content}`;
        })
        .join('\n');
};

export const getLoadProjectContext = ({
    getDocument,
}: {
    getDocument: () => Promise<ProjectContextEntry[]>;
}) =>
    tool({
        ...loadProjectContextToolDefinition.for('agent'),
        execute: async () => {
            try {
                const entries = await getDocument();

                const approxTokens = Math.ceil(
                    entries.reduce(
                        (sum, e) =>
                            sum +
                            e.content.length +
                            e.id.length +
                            e.terms.join(' ').length +
                            e.objects.join(' ').length +
                            32,
                        0,
                    ) / 4,
                );
                const entryIds = entries.map((e) => e.id);
                // Budget metric: what the agent actually loads per turn.
                Logger.info(
                    `[ProjectContext] count=${entries.length} approxTokens=${approxTokens} ids=${entryIds.join(',')}`,
                );

                return {
                    result: renderEntries(entries),
                    metadata: {
                        status: 'success' as const,
                        entryIds,
                        approxTokens,
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        'Error loading project context',
                    ),
                    metadata: { status: 'error' as const },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
