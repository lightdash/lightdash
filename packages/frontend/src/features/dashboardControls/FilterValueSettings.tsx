import {
    type DashboardFilterableField,
    type DashboardFilterRule,
    type FilterType,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { useEffect, useRef, useState, type FC } from 'react';
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

const getInputs = (root: HTMLElement | null): HTMLInputElement[] => [
    ...(root?.querySelectorAll('input') ?? []),
];

// The shipped settings form without its label and Required card. No Apply:
// each edit is written at once, except the one the shipped Apply refuses
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
    const root = useRef<HTMLDivElement>(null);
    // Counts the refused edits: the form is remounted on each one, so its
    // inputs show the value the rule kept and not the one that was refused
    const [refusals, setRefusals] = useState(0);
    const [wasRefused, setWasRefused] = useState(false);
    const refocusIndex = useRef(-1);
    const handleChange = (next: DashboardFilterRule) => {
        const written = getFilterRuleWithDisabledState(next, true);
        // A rule already in that state can still be edited out of it
        if (
            isLockedRequiredMissingValue(written) &&
            !isLockedRequiredMissingValue(filterRule)
        ) {
            refocusIndex.current = getInputs(root.current).findIndex(
                (input) => input === document.activeElement,
            );
            setRefusals((count) => count + 1);
            setWasRefused(true);
            return;
        }
        setWasRefused(false);
        onChange(written);
    };

    // Focus is a DOM matter: the remount took it from the input being typed
    // in. Its text is selected, so typing replaces the kept value
    useEffect(() => {
        const input = getInputs(root.current)[refocusIndex.current];
        refocusIndex.current = -1;
        if (input === undefined || input.readOnly) return;
        input.focus();
        input.select();
    }, [refusals]);

    return (
        <Stack gap="xs" ref={root}>
            <ShippedFilterSettings
                key={refusals}
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
                <Text
                    size="xs"
                    c={wasRefused ? 'red' : 'dimmed'}
                    fw={wasRefused ? 500 : undefined}
                    role={wasRefused ? 'alert' : undefined}
                >
                    {getUiString('filters.config.applyLockedRequiredTooltip')}
                </Text>
            )}
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
