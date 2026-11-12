import { Button, Group, Text, Tooltip } from '@mantine/core';
import { IconChevronDown, IconFilter } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import FilterGroupSeparator from './FilterGroupSeparator';

type Props = {
    filtersCount: number;
    parametersCount: number;
    /** Named date zooms on the bar (default 0). */
    dateZoomsCount?: number;
    /** The funnel circle before the counts (default true). */
    withGroupMarker?: boolean;
    dateZoomLabel: string | null;
    onExpand: () => void;
};

export const DashboardFiltersBarSummary: FC<Props> = ({
    filtersCount,
    parametersCount,
    dateZoomsCount = 0,
    withGroupMarker = true,
    dateZoomLabel,
    onExpand,
}) => {
    const getUiString = useUiStrings();
    const hasFilters = filtersCount > 0;
    const hasParameters = parametersCount > 0;
    const hasDateZooms = dateZoomsCount > 0;
    const hasDateZoom = dateZoomLabel !== null;

    return (
        <Group
            justify="space-between"
            align="center"
            wrap="nowrap"
            px="lg"
            py="xxs"
        >
            <Group gap="xs" align="center">
                {withGroupMarker &&
                    (hasFilters ||
                        hasParameters ||
                        hasDateZooms ||
                        hasDateZoom) && (
                        <FilterGroupSeparator icon={IconFilter} />
                    )}

                <Text fz="12" c="dimmed">
                    {hasFilters && (
                        <>
                            <Text span fw={600}>
                                {filtersCount}{' '}
                            </Text>
                            {getUiString(
                                filtersCount === 1
                                    ? 'filters.summary.filterSingular'
                                    : 'filters.summary.filterPlural',
                            )}
                        </>
                    )}
                    {hasFilters && hasParameters && ' · '}
                    {hasParameters && (
                        <>
                            <Text span fw={600}>
                                {parametersCount}{' '}
                            </Text>
                            {getUiString(
                                parametersCount === 1
                                    ? 'filters.summary.parameterSingular'
                                    : 'filters.summary.parameterPlural',
                            )}
                        </>
                    )}
                    {(hasFilters || hasParameters) && hasDateZooms && ' · '}
                    {hasDateZooms && (
                        <>
                            <Text span fw={600}>
                                {dateZoomsCount}{' '}
                            </Text>
                            {getUiString(
                                dateZoomsCount === 1
                                    ? 'filters.summary.dateZoomSingular'
                                    : 'filters.summary.dateZoomPlural',
                            )}
                        </>
                    )}
                    {(hasFilters || hasParameters || hasDateZooms) &&
                        hasDateZoom &&
                        ' · '}
                    {hasDateZoom && (
                        <>
                            <Text span fw={600}>
                                {getUiString('filters.summary.dateZoomLabel')}
                            </Text>{' '}
                            {dateZoomLabel}
                        </>
                    )}
                </Text>
            </Group>
            <Tooltip label={getUiString('filters.summary.showFilters')}>
                <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    rightSection={<MantineIcon icon={IconChevronDown} />}
                    onClick={onExpand}
                >
                    {getUiString('filters.summary.showFilters')}
                </Button>
            </Tooltip>
        </Group>
    );
};
