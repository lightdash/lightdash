import {
    type DashboardFilterableField,
    type DashboardFilterRule,
    type FilterType,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import ShippedFilterSettings from '../dashboardFilters/FilterConfiguration/FilterSettings';
import { getFilterRuleWithDisabledState } from '../dashboardFilters/FilterConfiguration/utils';
import { isLockedRequiredMissingValue } from './requirements';
import { isDefaultValueIncomplete } from './sidebarState';

type Props = {
    filterType: FilterType;
    field: DashboardFilterableField | null;
    filterRule: DashboardFilterRule;
    onChange: (next: DashboardFilterRule) => void;
};

// The shipped settings form without its label and its Required card. There
// is no Apply: every edit is written at once, through the shipped popover's
// rule, except the one the shipped Apply refuses
export const FilterValueSettings: FC<Props> = ({
    filterType,
    field,
    filterRule,
    onChange,
}) => {
    const getUiString = useUiStrings();
    const isRequired = !!filterRule.required || !!filterRule.requiredGroupId;
    const isLockedAndRequired =
        !!filterRule.lockedTabUuids?.length && !!filterRule.required;
    const handleChange = (next: DashboardFilterRule) => {
        const written = getFilterRuleWithDisabledState(next, true);
        // A rule already in that state can still be edited out of it
        if (
            isLockedRequiredMissingValue(written) &&
            !isLockedRequiredMissingValue(filterRule)
        )
            return;
        onChange(written);
    };

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
                onChangeFilterRule={handleChange}
            />
            {isLockedAndRequired && (
                <Text size="xs" c="dimmed">
                    {getUiString('filters.config.applyLockedRequiredTooltip')}
                </Text>
            )}
            {isDefaultValueIncomplete(filterRule) && (
                <Text size="xs" c="dimmed">
                    Choose a value, or the default is left off.
                </Text>
            )}
            {!!filterRule.disabled && !isRequired && (
                <Text size="xs" c="dimmed">
                    Not set: each tile keeps its own values until a viewer picks
                    one.
                </Text>
            )}
        </Stack>
    );
};
