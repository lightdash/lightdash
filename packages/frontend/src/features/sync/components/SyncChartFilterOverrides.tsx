import { subject } from '@casl/ability';
import {
    getTotalFilterRules,
    type FilterRule,
    type Filters,
} from '@lightdash/common';
import { Stack, Switch } from '@mantine/core';
import { type FC } from 'react';
import useApp from '../../../providers/App/useApp';
import { SchedulerFormChartFilterOverridesTab } from '../../scheduler/components/SchedulerForm/SchedulerFormChartFilterOverridesTab';
import { type SyncResource } from '../types';
import { useSyncModalFormContext } from './syncModalFormContext';

type Props = {
    chart: Extract<SyncResource, { type: 'chart' }>['chart'];
    savedFilters: Filters | undefined;
    isEditing: boolean;
    filtersWithUnmetRequirements: FilterRule[];
};

export const SyncChartFilterOverrides: FC<Props> = ({
    chart,
    savedFilters,
    isEditing,
    filtersWithUnmetRequirements,
}) => {
    const form = useSyncModalFormContext();
    const { user } = useApp();
    const canAdjustFilters = user.data?.ability.can(
        'manage',
        subject('Explore', {
            organizationUuid: chart.organizationUuid,
            projectUuid: chart.projectUuid,
        }),
    );

    if (
        !canAdjustFilters ||
        (getTotalFilterRules(chart.metricQuery.filters).length === 0 &&
            (!savedFilters || getTotalFilterRules(savedFilters).length === 0))
    ) {
        return null;
    }

    return (
        <Stack gap="xs">
            <Switch
                label="Customize filters for this sync"
                description="By default, this sync uses the chart’s saved filters."
                {...form.getInputProps('customizeFilters', {
                    type: 'checkbox',
                })}
            />
            {form.values.customizeFilters && (
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
