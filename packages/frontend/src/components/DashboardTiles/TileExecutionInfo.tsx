import {
    FeatureFlags,
    type CacheMetadata,
    type QueryResultsPerformance,
    type QueryResultsPreAggregate,
} from '@lightdash/common';
import { ActionIcon, Divider, Stack, HoverCard } from '@mantine/core';
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
    preAggregate: QueryResultsPreAggregate | null;
    performance: QueryResultsPerformance | undefined;
    totalClientFetchTimeMs: number | undefined;
    totalResults: number | undefined;
};

// `cacheMetadata.preAggregate.hit` is the plan-time match; `preAggregate` from
// results metadata is the post-execution truth, including warehouse fallback.
function getResultSource(
    cacheMetadata: CacheMetadata,
    preAggregate: QueryResultsPreAggregate | null,
): string {
    if (cacheMetadata.cacheHit) return 'Result cache';
    if (preAggregate) {
        if (preAggregate.fallbackReason !== null)
            return 'Warehouse (pre-aggregate failed)';
        return preAggregate.execution === 'duckdb'
            ? 'DuckDB pre-aggregate'
            : 'External pre-aggregate';
    }
    if (cacheMetadata.preAggregate?.hit) return 'DuckDB pre-aggregate';
    return 'Warehouse';
}

function isServedFromPreAggregate(
    cacheMetadata: CacheMetadata,
    preAggregate: QueryResultsPreAggregate | null,
): boolean {
    if (preAggregate) return preAggregate.fallbackReason === null;
    return cacheMetadata.preAggregate?.hit ?? false;
}

const TileExecutionInfo: FC<TileExecutionInfoProps> = ({
    cacheMetadata,
    preAggregate,
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
                        {getResultSource(cacheMetadata, preAggregate)}
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
                <ActionIcon size="sm" variant="subtle" color="gray">
                    <MantineIcon
                        icon={
                            isServedFromPreAggregate(
                                cacheMetadata,
                                preAggregate,
                            )
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
