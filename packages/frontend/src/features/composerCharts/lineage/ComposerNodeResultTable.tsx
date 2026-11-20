import { Box } from '@mantine/core';
import { type FC } from 'react';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import { type InfiniteQueryResults } from '../../../hooks/useQueryResults';
import { AiComposerResultError } from './AiComposerResultError';
import { AiComposerResultTable } from './AiComposerResultTable';

const MAX_HEIGHT_PX = 320;
// Rendered sizes of the shared table: its header, then 36px per row.
const HEADER_HEIGHT_PX = 31;
const ROW_HEIGHT_PX = 36;
// The table keeps an empty pagination footer under the rows; the notebook
// cell (overflow hidden) clips it through the negative margin below.
const EMPTY_FOOTER_PX = 12;

/** Header and rows, capped so long results scroll inside the cell. */
const tableHeightOf = (rowCount: number | undefined) =>
    rowCount === undefined
        ? MAX_HEIGHT_PX
        : Math.min(
              MAX_HEIGHT_PX,
              HEADER_HEIGHT_PX + ROW_HEIGHT_PX * Math.max(rowCount, 1),
          );

/** A node's rows, in the table every composer result uses. */
export const ComposerNodeResultTable: FC<{
    projectUuid: string;
    results: InfiniteQueryResults;
}> = ({ projectUuid, results }) => {
    const uiStrings = useUiStrings();
    if (results.error) {
        return (
            <AiComposerResultError
                headerContent={null}
                message={results.error.error?.message ?? null}
            />
        );
    }
    return (
        <Box
            h={tableHeightOf(results.totalResults) + EMPTY_FOOTER_PX}
            mb={-EMPTY_FOOTER_PX}
        >
            <AiComposerResultTable
                projectUuid={projectUuid}
                results={results}
                headerContent={null}
                loadingMessage={uiStrings('aiAgent.composer.loadingResult')}
            />
        </Box>
    );
};
