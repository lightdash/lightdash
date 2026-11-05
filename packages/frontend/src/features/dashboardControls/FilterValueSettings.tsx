import {
    FilterType,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Box, Group, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import FilterInputComponent from '../../components/common/Filters/FilterInputs';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { ClearToAnyValueButton } from '../dashboardFilters/FilterConfiguration/FilterValueSection';
import classes from './FilterEditor.module.css';
import { type useRuleEdits } from './useRuleEdits';

type Props = {
    rule: DashboardFilterRule;
    field: DashboardFilterableField | null;
    filterType: FilterType;
    isViewer: boolean;
    /** A viewer's new filter: the shipped "Value" label above the value. */
    isCreatingNew: boolean;
    /** The viewer's "manage Explore" ability, which gates the clear X. */
    canManageExplore: boolean;
    edits: ReturnType<typeof useRuleEdits>;
};

// The shipped value input on its own (the operator is in the header), with
// the viewer's clear X and the reason a locked, required filter keeps a value
export const FilterValueSettings: FC<Props> = ({
    rule,
    field,
    filterType,
    isViewer,
    isCreatingNew,
    canManageExplore,
    edits,
}) => {
    const getUiString = useUiStrings();
    const { root, refusals, resets, handleChange } = edits;
    const hasRequirement = !!rule.required || !!rule.requiredGroupId;
    return (
        <Stack ref={root} gap="xs" className={classes.content}>
            {isViewer && isCreatingNew && (
                <Text size="xs" fw={500}>
                    {getUiString('filters.config.valueLabel')}
                </Text>
            )}
            <Group
                key={`${refusals}-${resets}`}
                gap="xs"
                wrap="nowrap"
                align="flex-start"
            >
                <Box flex={1} miw={0} className={classes.valueForm}>
                    <FilterInputComponent
                        filterType={filterType}
                        field={field ?? undefined}
                        // Shown enabled: no value is any value
                        rule={
                            !isViewer && rule.disabled
                                ? { ...rule, disabled: false }
                                : rule
                        }
                        popoverProps={
                            // An open list would cover Apply: shut on focus
                            // and closed on pick. Only the string inputs read
                            // it; date pickers would hand it to their DOM
                            filterType === FilterType.STRING
                                ? {
                                      closeListOnPick: true,
                                      openListOnFocus: false,
                                  }
                                : undefined
                        }
                        onChange={(next) =>
                            handleChange(next as DashboardFilterRule)
                        }
                    />
                </Box>
                {isViewer && canManageExplore && !hasRequirement && (
                    <ClearToAnyValueButton
                        filterType={filterType}
                        filterRule={rule}
                        onChangeFilterRule={handleChange}
                    />
                )}
            </Group>
            <LockedRequiredNote
                rule={rule}
                edits={edits}
                className={undefined}
            />
        </Stack>
    );
};

/** Why a locked, required filter keeps a value; an alert on each refused edit. */
export const LockedRequiredNote: FC<{
    rule: DashboardFilterRule;
    edits: ReturnType<typeof useRuleEdits>;
    /** Its own padding where no value section holds it. */
    className: string | undefined;
}> = ({ rule, edits: { refusals, wasRefused }, className }) => {
    const getUiString = useUiStrings();
    if (!rule.lockedTabUuids?.length || !rule.required) return null;
    return (
        // A new node per refusal, so each one is announced
        <Text
            key={wasRefused ? refusals : 'at-rest'}
            fz="xs"
            c={wasRefused ? 'red' : 'dimmed'}
            fw={wasRefused ? 500 : undefined}
            role={wasRefused ? 'alert' : undefined}
            className={className}
        >
            {getUiString('filters.config.applyLockedRequiredTooltip')}
        </Text>
    );
};
