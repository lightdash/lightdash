import {
    FeatureFlags,
    type CacheMetadata,
    type QueryResultsPerformance,
    type QueryResultsPreAggregate,
} from '@lightdash/common';
import { ActionIcon, Divider, Menu, Stack, Popover } from '@mantine/core';
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
import { type TFunction } from 'i18next';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import MantineIcon from '../common/MantineIcon';
import InfoRow from '../common/PageHeader/InfoRow';
import { TileHeaderPopover } from './TileBase/TileHeaderPopover';

type TileExecutionInfoProps = {
    cacheMetadata: CacheMetadata;
    preAggregate: QueryResultsPreAggregate | null;
    performance: QueryResultsPerformance | undefined;
    totalClientFetchTimeMs: number | undefined;
    totalResults: number | undefined;
    targetVariant?: 'actionIcon' | 'menuItem';
};

// `cacheMetadata.preAggregate.hit` is the plan-time match; `preAggregate` from
// results metadata is the post-execution truth, including warehouse fallback.
function getResultSource(
    t: TFunction,
    cacheMetadata: CacheMetadata,
    preAggregate: QueryResultsPreAggregate | null,
): string {
    if (cacheMetadata.cacheHit) return t('executionInfo.source.resultCache');
    if (preAggregate) {
        if (preAggregate.fallbackReason !== null)
            return t('executionInfo.source.warehousePreAggregateFailed');
        return preAggregate.execution === 'duckdb'
            ? t('executionInfo.source.duckdbPreAggregate')
            : t('executionInfo.source.externalPreAggregate');
    }
    if (cacheMetadata.preAggregate?.hit)
        return t('executionInfo.source.duckdbPreAggregate');
    return t('executionInfo.source.warehouse');
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
    targetVariant = 'actionIcon',
}) => {
    const { t } = useTranslation('dashboard');
    const getUiString = useUiStrings();
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
    const icon = isServedFromPreAggregate(cacheMetadata, preAggregate)
        ? IconClockBolt
        : IconClock;

    return (
        <TileHeaderPopover>
            <Popover.Dropdown
                maw="calc(100vw - 24px)"
                mah="calc(100dvh - 24px)"
                style={{ overflowY: 'auto' }}
            >
                <Stack gap={10} w={240} p={4}>
                    <InfoRow
                        icon={IconLayoutRows}
                        label={t('executionInfo.rows')}
                    >
                        {(totalResults ?? 0).toLocaleString()}
                    </InfoRow>

                    <InfoRow
                        icon={IconDatabase}
                        label={t('executionInfo.source.label')}
                    >
                        {getResultSource(t, cacheMetadata, preAggregate)}
                    </InfoRow>

                    <Divider />

                    {performance.queueTimeMs !== null && (
                        <InfoRow
                            icon={IconHourglass}
                            label={t('executionInfo.queue')}
                        >
                            {performance.queueTimeMs}ms
                        </InfoRow>
                    )}

                    {performance.initialQueryExecutionMs !== null && (
                        <InfoRow
                            icon={IconServer}
                            label={t('executionInfo.execution')}
                        >
                            {performance.initialQueryExecutionMs}ms
                        </InfoRow>
                    )}

                    {networkOverheadMs > 0 && (
                        <InfoRow
                            icon={IconNetwork}
                            label={t('executionInfo.network')}
                        >
                            {Math.round(networkOverheadMs)}ms
                        </InfoRow>
                    )}

                    <Divider />

                    <InfoRow
                        icon={IconClockPlay}
                        label={t('executionInfo.total')}
                    >
                        {totalClientFetchTimeMs}ms
                    </InfoRow>
                </Stack>
            </Popover.Dropdown>
            <Popover.Target>
                {targetVariant === 'menuItem' ? (
                    <Menu.Item
                        closeMenuOnClick={false}
                        leftSection={<MantineIcon icon={icon} />}
                    >
                        {getUiString('tileMenu.execution')}
                    </Menu.Item>
                ) : (
                    <ActionIcon
                        aria-label={getUiString('tileMenu.execution')}
                        size="sm"
                    >
                        <MantineIcon icon={icon} />
                    </ActionIcon>
                )}
            </Popover.Target>
        </TileHeaderPopover>
    );
};

export default TileExecutionInfo;
