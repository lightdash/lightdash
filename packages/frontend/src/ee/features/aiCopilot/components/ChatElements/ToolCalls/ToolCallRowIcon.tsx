import { Box } from '@mantine/core';
import { type ComponentProps, type FC } from 'react';
import { useApiSourceExploreConnectionUuid } from '../../../../../../features/externalConnections/liveSources/apiSourceExplore';
import { LiveSourceIcon } from '../../../../../../features/externalConnections/liveSources/LiveSourceIcon';
import { useLiveSourceConnection } from '../../../../../../features/externalConnections/liveSources/useLiveSourceConnection';
import { ToolCallIcon } from './ToolCallIcon';
import { getLiveSourceToolTarget } from './utils/getLiveSourceToolTarget';
import { type ToolCallSummary } from './utils/types';

type Props = ComponentProps<typeof ToolCallIcon> & {
    toolCalls: ToolCallSummary[];
};

/** The tool's icon, or the integration's when every call reads one live data source. */
export const ToolCallRowIcon: FC<Props> = ({ toolCalls, ...iconProps }) => {
    const target = getLiveSourceToolTarget(toolCalls);
    const exploreConnectionUuid = useApiSourceExploreConnectionUuid(
        target?.kind === 'explore' ? target.exploreName : null,
    );
    const liveSource = useLiveSourceConnection(
        target?.kind === 'connection'
            ? target.connectionUuid
            : exploreConnectionUuid,
    );
    if (!liveSource) {
        return <ToolCallIcon {...iconProps} />;
    }
    return (
        <Box
            component="span"
            aria-hidden
            display="inline-flex"
            className={iconProps.className}
            data-status={iconProps['data-status']}
        >
            <LiveSourceIcon
                connector={liveSource.connector}
                size={iconProps.size}
            />
        </Box>
    );
};
