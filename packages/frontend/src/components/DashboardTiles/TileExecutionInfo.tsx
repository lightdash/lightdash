import {
    FeatureFlags,
    type CacheMetadata,
    type QueryResultsPerformance,
} from '@lightdash/common';
import { Divider, Stack } from '@mantine-8/core';
import { ActionIcon, HoverCard } from '@mantine/core';
import {
    IconClock,
    IconClockBolt,
    IconClockPlay,
    IconDatabase,
    IconHourglass,
    IconLayoutRows,
    IconNetwork,
    IconServer,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import MantineIcon from '../common/MantineIcon';
import InfoRow from '../common/PageHeader/InfoRow';

type TileExecutionInfoProps = {
    cacheMetadata: CacheMetadata;
    performance: QueryResultsPerformance | undefined;
    totalClientFetchTimeMs: number | undefined;
    totalResults: number | undefined;
};

function getResultSource(cacheMetadata: CacheMetadata): string {
    if (cacheMetadata.cacheHit) return 'Result cache';
    if (cacheMetadata.preAggregate?.hit) return 'DuckDB pre-aggregate';
    return 'Warehouse';
}

const TileExecutionInfo: FC<TileExecutionInfoProps> = ({
    cacheMetadata,
    performance,
    totalClientFetchTimeMs,
    totalResults,
}) => {
    const { data: showExecutionTimeFlag } = useServerFeatureFlag(
        FeatureFlags.ShowExecutionTime,
    );
    const isEnabled = showExecutionTimeFlag?.enabled ?? false;

    if (
        !isEnabled ||
        performance === undefined ||
        totalClientFetchTimeMs === undefined
    ) {
        return null;
    }

    const networkOverheadMs =
        totalClientFetchTimeMs -
        (performance.initialQueryExecutionMs ?? 0) -
        (performance.queueTimeMs ?? 0);

    return (
        <HoverCard
            withArrow
            withinPortal
            shadow="md"
            position="bottom-end"
            offset={4}
            arrowOffset={10}
        >
            <HoverCard.Dropdown>
                <Stack gap={10} w={240} p={4}>
                    <InfoRow icon={IconLayoutRows} label="Rows">
                        {(totalResults ?? 0).toLocaleString()}
                    </InfoRow>

                    <InfoRow icon={IconDatabase} label="Source">
                        {getResultSource(cacheMetadata)}
                    </InfoRow>

                    <Divider />

                    {performance.queueTimeMs !== null && (
                        <InfoRow icon={IconHourglass} label="Queue">
                            {performance.queueTimeMs}ms
                        </InfoRow>
                    )}

                    {performance.initialQueryExecutionMs !== null && (
                        <InfoRow icon={IconServer} label="Execution">
                            {performance.initialQueryExecutionMs}ms
                        </InfoRow>
                    )}

                    {networkOverheadMs > 0 && (
                        <InfoRow icon={IconNetwork} label="Network">
                            {Math.round(networkOverheadMs)}ms
                        </InfoRow>
                    )}

                    <Divider />

                    <InfoRow icon={IconClockPlay} label="Total">
                        {totalClientFetchTimeMs}ms
                    </InfoRow>
                </Stack>
            </HoverCard.Dropdown>
            <HoverCard.Target>
                <ActionIcon size="sm">
                    <MantineIcon
                        icon={
                            cacheMetadata.preAggregate?.hit
                                ? IconClockBolt
                                : IconClock
                        }
                    />
                </ActionIcon>
            </HoverCard.Target>
        </HoverCard>
    );
};

export default TileExecutionInfo;
