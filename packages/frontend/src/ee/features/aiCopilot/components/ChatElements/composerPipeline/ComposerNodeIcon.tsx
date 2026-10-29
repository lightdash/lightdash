import { QuerySourceType, type SourceQuery } from '@lightdash/common';
import { type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { LiveSourceConnectionIcon } from '../../../../../../features/externalConnections/liveSources/LiveSourceIcon';
import { nodeTypeIcon } from './nodeTypeIcon';

/** A node's type icon; live API nodes show their integration's mark. */
export const ComposerNodeIcon: FC<{ query: SourceQuery; size: number }> = ({
    query,
    size,
}) =>
    query.sourceType === QuerySourceType.API ? (
        <LiveSourceConnectionIcon
            connectionUuid={query.connectionUuid}
            size={size}
        />
    ) : (
        <MantineIcon
            icon={nodeTypeIcon(query)}
            size={size}
            stroke={1.5}
            aria-hidden
        />
    );
