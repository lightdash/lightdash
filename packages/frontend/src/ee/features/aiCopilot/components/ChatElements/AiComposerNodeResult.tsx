import { Box } from '@mantine/core';
import { type FC } from 'react';
import { ROW_HEIGHT_PX } from '../../../../../components/common/Table/constants';
import { useUiStrings } from '../../../../providers/Embed/useUiStrings';
import { AiComposerResultError } from './AiComposerResultError';
import { AiComposerResultTable } from './AiComposerResultTable';
import {
    useComposerNodeResults,
    type ComposerPanelSource,
} from './useComposerNodeResults';

const MAX_HEIGHT_PX = 320;
// The pagination footer under the rows, with its row count.
const FOOTER_HEIGHT_PX = 44;

/** Header, rows and footer, capped so long results scroll inside the cell. */
const tableHeightOf = (rowCount: number | undefined) =>
    rowCount === undefined
        ? MAX_HEIGHT_PX
        : Math.min(
              MAX_HEIGHT_PX,
              ROW_HEIGHT_PX * (Math.max(rowCount, 1) + 1) + FOOTER_HEIGHT_PX,
          );

type Props = {
    projectUuid: string;
    agentUuid: string;
    source: ComposerPanelSource;
    queryUuid: string;
};

/** A pipeline node's own rows, in the table every composer result uses. */
export const AiComposerNodeResult: FC<Props> = ({
    projectUuid,
    agentUuid,
    source,
    queryUuid,
}) => {
    const uiStrings = useUiStrings();
    const results = useComposerNodeResults({
        projectUuid,
        agentUuid,
        source,
        queryUuid,
    });
    if (results.error) {
        return (
            <AiComposerResultError
                headerContent={null}
                message={results.error.error?.message ?? null}
            />
        );
    }
    return (
        <Box h={tableHeightOf(results.totalResults)}>
            <AiComposerResultTable
                projectUuid={projectUuid}
                results={results}
                headerContent={null}
                loadingMessage={uiStrings('aiAgent.composer.loadingResult')}
            />
        </Box>
    );
};
