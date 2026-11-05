import { type Filters } from '@lightdash/common';
import { Stack } from '@mantine/core';
import { useCallback, type FC } from 'react';
import { EventDateRangeFilter } from '../../eventAnalytics/components/EventDateRangeFilter';
import { EventFiltersForm } from '../../eventAnalytics/components/EventFiltersForm';
import { useAppDispatch, useAppSelector } from '../store';
import {
    selectCustomDateRange,
    selectDateRangePreset,
    selectExploreName,
    selectFilters,
    setCustomDateRange,
    setDateRangePreset,
    setFilters,
} from '../store/funnelBuilderSlice';

type Props = {
    projectUuid: string;
};

export const FunnelFilters: FC<Props> = ({ projectUuid }) => {
    const dispatch = useAppDispatch();
    const dateRangePreset = useAppSelector(selectDateRangePreset);
    const customDateRange = useAppSelector(selectCustomDateRange);
    const exploreName = useAppSelector(selectExploreName);
    const filters = useAppSelector(selectFilters);

    const handleFiltersChange = useCallback(
        (value: Filters) => dispatch(setFilters(value)),
        [dispatch],
    );

    return (
        <Stack gap="sm">
            <EventDateRangeFilter
                preset={dateRangePreset}
                customRange={customDateRange}
                onPresetChange={(preset) =>
                    dispatch(setDateRangePreset(preset))
                }
                onCustomRangeChange={(range) =>
                    dispatch(setCustomDateRange(range))
                }
            />
            {exploreName && (
                <EventFiltersForm
                    projectUuid={projectUuid}
                    exploreName={exploreName}
                    filters={filters}
                    onChange={handleFiltersChange}
                />
            )}
        </Stack>
    );
};
