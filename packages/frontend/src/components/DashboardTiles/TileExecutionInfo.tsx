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
import { type FC } from 'react';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import MantineIcon from '../common/MantineIcon';
import InfoRow from '../common/PageHeader/InfoRow';
import tileClasses from './DashboardTiles.module.css';
import { TileHeaderPopover } from './TileBase/TileHeaderPopover';
import {
    getResultSource,
    isServedFromPreAggregate,
} from './tileExecutionInfo.utils';

type TileExecutionInfoProps = {
    cacheMetadata: CacheMetadata;
    preAggregate: QueryResultsPreAggregate | null;
    performance: QueryResultsPerformance | undefined;
    totalClientFetchTimeMs: number | undefined;
    totalResults: number | undefined;
    targetVariant?: 'actionIcon' | 'menuItem';
};

const TileExecutionInfo: FC<TileExecutionInfoProps> = ({
    cacheMetadata,
    preAggregate,
    performance,
    totalClientFetchTimeMs,
    totalResults,
    targetVariant = 'actionIcon',
}) => {
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
                className={tileClasses.scrollableDropdown}
            >
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
