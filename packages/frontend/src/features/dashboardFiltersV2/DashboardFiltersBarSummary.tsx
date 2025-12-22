import { Button, Group, Text, Tooltip } from '@mantine-8/core';
import { IconChevronDown, IconFilter } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import FilterGroupSeparator from '../dashboardHeader/FilterGroupSeparator';

type Props = {
    filtersCount: number;
    parametersCount: number;
    dateZoomLabel: string | null;
    onExpand: () => void;
};

export const DashboardFiltersBarSummary: FC<Props> = ({
    filtersCount,
    parametersCount,
    dateZoomLabel,
    onExpand,
}) => {
    const hasFilters = filtersCount > 0;
    const hasParameters = parametersCount > 0;
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
                {(hasFilters || hasParameters || hasDateZoom) && (
                    <FilterGroupSeparator icon={IconFilter} />
                )}

                <Text fz="12" c="dimmed">
                    {hasFilters && (
                        <>
                            <Text span fw={600} fz="inherit">
                                {filtersCount}{' '}
                            </Text>
                            {filtersCount === 1 ? 'filter' : 'filters'}
                        </>
                    )}
                    {hasFilters && hasParameters && ' · '}
                    {hasParameters && (
                        <>
                            <Text span fw={600} fz="inherit">
                                {parametersCount}{' '}
                            </Text>
                            {parametersCount === 1 ? 'parameter' : 'parameters'}
                        </>
                    )}
                    {(hasFilters || hasParameters) && hasDateZoom && ' · '}
                    {hasDateZoom && (
                        <>
                            <Text span fw={600} fz="inherit">
                                Date Zoom:
                            </Text>{' '}
                            {dateZoomLabel}
                        </>
                    )}
                </Text>
            </Group>
            <Tooltip label="Show filters">
                <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    rightSection={<MantineIcon icon={IconChevronDown} />}
                    onClick={onExpand}
                >
                    Show filters
                </Button>
            </Tooltip>
        </Group>
    );
};
