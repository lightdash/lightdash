import {
    type DashboardFilterableField,
    type DashboardFilterRule,
    type FilterType,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import ShippedFilterSettings from '../dashboardFilters/FilterConfiguration/FilterSettings';
import { getFilterRuleWithDisabledState } from '../dashboardFilters/FilterConfiguration/utils';
import { isDefaultValueIncomplete } from './sidebarState';

type Props = {
    filterType: FilterType;
    field: DashboardFilterableField | null;
    filterRule: DashboardFilterRule;
    onChange: (next: DashboardFilterRule) => void;
};

// The shipped settings form without its label and its Required card. There
// is no Apply: every edit is written at once, through the shipped popover's rule
export const FilterValueSettings: FC<Props> = ({
    filterType,
    field,
    filterRule,
    onChange,
}) => {
    const isRequired = !!filterRule.required || !!filterRule.requiredGroupId;

    return (
        <Stack gap="xs">
            <ShippedFilterSettings
                isEditMode
                isCreatingNew={false}
                hideLabel
                hideRequiredCard
                filterType={filterType}
                field={field ?? undefined}
                filterRule={filterRule}
                onChangeFilterRule={(next) =>
                    onChange(getFilterRuleWithDisabledState(next, true))
                }
            />
            {isDefaultValueIncomplete(filterRule) && (
                <Text size="xs" c="dimmed">
                    Set a value, or the default stays off.
                </Text>
            )}
            {!!filterRule.disabled && !isRequired && (
                <Text size="xs" c="dimmed">
                    No default: each tile keeps its own values until a viewer
                    sets one.
                </Text>
            )}
        </Stack>
    );
};
