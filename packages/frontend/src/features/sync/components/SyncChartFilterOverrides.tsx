import { type FilterRule, type Filters } from '@lightdash/common';
import { Stack, Switch } from '@mantine/core';
import { type FC } from 'react';
import { SchedulerFormChartFilterOverridesTab } from '../../scheduler/components/SchedulerForm/SchedulerFormChartFilterOverridesTab';
import { type SyncResource } from '../types';
import { useSyncModalFormContext } from './syncModalFormContext';

type Props = {
    chart: Extract<SyncResource, { type: 'chart' }>['chart'];
    savedFilters: Filters | undefined;
    canAdjustFilters: boolean;
    isEditing: boolean;
    filtersWithUnmetRequirements: FilterRule[];
};

export const SyncChartFilterOverrides: FC<Props> = ({
    chart,
    savedFilters,
    canAdjustFilters,
    isEditing,
    filtersWithUnmetRequirements,
}) => {
    const form = useSyncModalFormContext();

    return (
        <Stack gap="xs">
            <Switch
                label="Customize filters for this sync"
                description={
                    canAdjustFilters
                        ? 'By default, this sync uses the chart’s saved filters.'
                        : 'Changing these values requires Explore access. Turn this off to use the chart’s saved filters.'
                }
                {...form.getInputProps('customizeFilters', {
                    type: 'checkbox',
                })}
            />
            {canAdjustFilters && form.values.customizeFilters && (
                <SchedulerFormChartFilterOverridesTab
                    savedChart={chart}
                    itemsMap={undefined}
                    draftFilters={form.values.chartFilters}
                    savedFilters={savedFilters}
                    isEditMode={isEditing}
                    onChange={(filters) =>
                        form.setFieldValue('chartFilters', filters)
                    }
                    filtersWithUnmetRequirements={filtersWithUnmetRequirements}
                    inheritDefaults
                />
            )}
        </Stack>
    );
};
