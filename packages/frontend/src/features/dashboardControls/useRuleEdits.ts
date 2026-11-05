import { type DashboardFilterRule } from '@lightdash/common';
import { useEffect, useRef, useState } from 'react';
import {
    getFilterRuleWithDisabledState,
    hasFilterValueSet,
    isLockedRequiredMissingValue,
} from '../dashboardFilters/FilterConfiguration/utils';

const getInputs = (root: HTMLElement | null): HTMLInputElement[] => [
    ...(root?.querySelectorAll('input') ?? []),
];

// Every edit, the operator's included: an editor's rule is off while it has
// no value (no value is any value), a viewer's goes through the shipped
// disabled state, and an edit that would empty a locked, required filter is
// refused
export const useRuleEdits = (
    rule: DashboardFilterRule,
    isViewer: boolean,
    onChange: (next: DashboardFilterRule) => void,
) => {
    const root = useRef<HTMLDivElement>(null);
    // Counts the refused edits: the form is remounted on each one, so its
    // inputs show the value the rule kept and not the one that was refused
    const [refusals, setRefusals] = useState(0);
    const [wasRefused, setWasRefused] = useState(false);
    // Counts the resets, which remount the form too: an input that keeps its
    // own text (the number input) shows the value put back
    const [resets, setResets] = useState(0);
    const refocusIndex = useRef(-1);
    const handleChange = (next: DashboardFilterRule) => {
        const written = isViewer
            ? getFilterRuleWithDisabledState(next, false)
            : { ...next, disabled: !hasFilterValueSet(next) };
        // A rule already in that state can still be edited out of it
        if (
            isLockedRequiredMissingValue(written) &&
            !isLockedRequiredMissingValue(rule)
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

    const reset = (next: DashboardFilterRule) => {
        setResets((count) => count + 1);
        handleChange(next);
    };

    return { root, refusals, resets, wasRefused, handleChange, reset };
};
