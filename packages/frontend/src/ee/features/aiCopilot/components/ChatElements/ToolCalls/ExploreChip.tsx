import { type ComponentProps, type FC } from 'react';
import { useLiveSourceExplore } from '../../../../../../features/externalConnections/liveSources/apiSourceExplore';
import { getLiveSource } from '../../../../../../features/externalConnections/liveSources/liveSourceCatalog';
import { LiveSourceIcon } from '../../../../../../features/externalConnections/liveSources/LiveSourceIcon';
import { ToolCallChip } from './ToolCallChip';

type Props = Omit<ComponentProps<typeof ToolCallChip>, 'children'> & {
    exploreName: string;
    /** Render nothing for an explore that isn't a live data source. */
    liveOnly?: boolean;
};

/**
 * An explore a tool call reads. A live data source explore shows its
 * integration's icon and the explore's label; any other shows its name.
 */
export const ExploreChip: FC<Props> = ({
    exploreName,
    liveOnly = false,
    ...chipProps
}) => {
    const liveSource = useLiveSourceExplore(exploreName);
    if (!liveSource) {
        return liveOnly ? null : (
            <ToolCallChip {...chipProps}>{exploreName}</ToolCallChip>
        );
    }
    return (
        <ToolCallChip
            {...chipProps}
            aria-label={`${getLiveSource(liveSource.connector).label}: ${liveSource.label}`}
            leftSection={
                <LiveSourceIcon connector={liveSource.connector} size={10} />
            }
        >
            {liveSource.label}
        </ToolCallChip>
    );
};
