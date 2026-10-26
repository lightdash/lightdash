import {
    type DashboardFilterableField,
    type DashboardFilterRule,
    type FilterType,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { useEffect, useRef, useState, type FC } from 'react';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { FilterValueSection } from '../dashboardFilters/FilterConfiguration/FilterValueSection';
import {
    getFilterRuleWithDisabledState,
    isLockedRequiredMissingValue,
} from '../dashboardFilters/FilterConfiguration/utils';
import classes from './ControlSidebar.module.css';
import { isDefaultValueIncomplete } from './sidebarState';

type Props = {
    /** A viewer's form: no default switch, and no value reads "any value". */
    isEditMode: boolean;
    /** A viewer's new filter: the shipped "Value" label above the form. */
    isCreatingNew: boolean;
    filterType: FilterType;
    field: DashboardFilterableField | null;
    filterRule: DashboardFilterRule;
    onChange: (next: DashboardFilterRule) => void;
};

const getInputs = (root: HTMLElement | null): HTMLInputElement[] => [
    ...(root?.querySelectorAll('input') ?? []),
];

// The value section of the shipped settings form. No Apply:
// each edit is written at once, except the one the shipped Apply refuses
export const FilterValueSettings: FC<Props> = ({
    isEditMode,
    isCreatingNew,
    filterType,
    field,
    filterRule,
    onChange,
}) => {
    const getUiString = useUiStrings();
    const isLockedAndRequired =
        !!filterRule.lockedTabUuids?.length && !!filterRule.required;
    const root = useRef<HTMLDivElement>(null);
    // Counts the refused edits: the form is remounted on each one, so its
    // inputs show the value the rule kept and not the one that was refused
    const [refusals, setRefusals] = useState(0);
    const [wasRefused, setWasRefused] = useState(false);
    const refocusIndex = useRef(-1);
    const handleChange = (next: DashboardFilterRule) => {
        const written = getFilterRuleWithDisabledState(next, isEditMode);
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

    // Focus is a DOM matter: the remount took it from the input in use. A
    // typed one has its text selected, so typing replaces the kept value
    useEffect(() => {
        const input = getInputs(root.current)[refocusIndex.current];
        refocusIndex.current = -1;
        if (input === undefined) return;
        input.focus();
        if (!input.readOnly) input.select();
    }, [refusals]);

    return (
        <Stack gap="xs" ref={root}>
            <Stack key={refusals} gap="xs" className={classes.valueForm}>
                <FilterValueSection
                    isEditMode={isEditMode}
                    isCreatingNew={isCreatingNew}
                    filterType={filterType}
                    field={field ?? undefined}
                    filterRule={filterRule}
                    onChangeFilterRule={handleChange}
                />
            </Stack>
            {isLockedAndRequired && (
                // A new node per refusal, so each one is announced
                <Text
                    key={wasRefused ? refusals : 'at-rest'}
                    size="xs"
                    c={wasRefused ? 'red' : 'dimmed'}
                    fw={wasRefused ? 500 : undefined}
                    role={wasRefused ? 'alert' : undefined}
                >
                    {getUiString('filters.config.applyLockedRequiredTooltip')}
                </Text>
            )}
            {isEditMode && isDefaultValueIncomplete(filterRule) && (
                <Text size="xs" c="dimmed">
                    Set a value, or the default stays off.
                </Text>
            )}
        </Stack>
    );
};
