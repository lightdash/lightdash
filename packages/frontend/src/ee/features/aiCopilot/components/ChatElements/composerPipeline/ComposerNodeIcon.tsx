import { QuerySourceType, type SourceQuery } from '@lightdash/common';
import { type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import {
    LiveSourceConnectionIcon,
    LiveSourceIcon,
} from '../../../../../../features/externalConnections/liveSources/LiveSourceIcon';
import { nodeTypeIcon } from './nodeTypeIcon';
import { useComposerNodeLiveSource } from './useComposerNodeLiveSource';

/** A node's type icon; nodes on a live data source show their integration's mark. */
export const ComposerNodeIcon: FC<{ query: SourceQuery; size: number }> = ({
    query,
    size,
}) => {
    const liveSource = useComposerNodeLiveSource(query);
    if (liveSource) {
        return <LiveSourceIcon connector={liveSource.connector} size={size} />;
    }
    if (query.sourceType === QuerySourceType.API) {
        return (
            <LiveSourceConnectionIcon
                connectionUuid={query.connectionUuid}
                size={size}
            />
        );
    }
    return (
        <MantineIcon
            icon={nodeTypeIcon(query)}
            size={size}
            stroke={1.5}
            aria-hidden
        />
    );
};
