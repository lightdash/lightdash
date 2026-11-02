import { Box } from '@mantine/core';
import { type FC } from 'react';
// Spike: reuses the AI composer result table for data app lineage.
import { AiComposerResultError } from '../../../ee/features/aiCopilot/components/ChatElements/AiComposerResultError';
import { AiComposerResultTable } from '../../../ee/features/aiCopilot/components/ChatElements/AiComposerResultTable';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import { useInfiniteQueryResults } from '../../../hooks/useQueryResults';

const MAX_HEIGHT_PX = 320;

/** A node's rows, read with the viewer's session like any async query. */
export const DataAppNodeResult: FC<{
    projectUuid: string;
    queryUuid: string;
}> = ({ projectUuid, queryUuid }) => {
    const getUiString = useUiStrings();
    const results = useInfiniteQueryResults(projectUuid, queryUuid);
    if (results.error) {
        return (
            <AiComposerResultError
                headerContent={null}
                message={results.error.error?.message ?? null}
            />
        );
    }
    return (
        <Box h={MAX_HEIGHT_PX}>
            <AiComposerResultTable
                projectUuid={projectUuid}
                results={results}
                headerContent={null}
                loadingMessage={getUiString('aiAgent.composer.loadingResult')}
            />
        </Box>
    );
};
