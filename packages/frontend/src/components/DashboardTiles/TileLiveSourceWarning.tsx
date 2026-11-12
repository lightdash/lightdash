import {
    LIVE_SOURCE_SOURCE_CUT_MESSAGE,
    type QueryResultsMetadata,
} from '@lightdash/common';
import { Box, Tooltip } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';

type Props = {
    metadata: QueryResultsMetadata | undefined;
};

/** Says a live data source cut the tile's rows, so nobody reads partial numbers as whole. */
const TileLiveSourceWarning: FC<Props> = ({ metadata }) => {
    if (metadata?.liveSourceCompleteness !== 'source_cut') {
        return null;
    }
    return (
        <Tooltip
            label={LIVE_SOURCE_SOURCE_CUT_MESSAGE}
            multiline
            maw={300}
            withinPortal
        >
            <Box
                component="span"
                role="img"
                aria-label="Incomplete results"
                display="inline-flex"
            >
                <MantineIcon icon={IconAlertCircle} color="yellow" />
            </Box>
        </Tooltip>
    );
};

export default TileLiveSourceWarning;
