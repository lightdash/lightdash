import {
    type DashboardFilterableField,
    type DashboardFilterRule,
    type FilterType,
} from '@lightdash/common';
import { TextInput, Stack, type PopoverProps } from '@mantine/core';
import { useEffect, useState, type FC } from 'react';
import RequiredFilterCard from '../FilterRequirements/RequiredFilterCard';
import { FilterValueSection } from './FilterValueSection';
import { getFilterRuleWithRequired } from './utils';

interface FilterSettingsProps {
    isEditMode: boolean;
    isCreatingNew: boolean;
    filterType: FilterType;
    field?: DashboardFilterableField;
    filterRule: DashboardFilterRule;
    originalFilterRule?: DashboardFilterRule;
    popoverProps?: Omit<PopoverProps, 'children'>;
    onChangeFilterRule: (value: DashboardFilterRule) => void;
    onEditRequirementRules?: () => void;
}

const FilterSettings: FC<FilterSettingsProps> = ({
    isEditMode,
    isCreatingNew,
    field,
    filterType,
    filterRule,
    originalFilterRule,
    popoverProps,
    onChangeFilterRule,
    onEditRequirementRules,
}) => {
    const [filterLabel, setFilterLabel] = useState<string>();

    // Set default label when using revert (undo) button
    useEffect(() => {
        if (filterLabel !== '') {
            setFilterLabel(filterRule.label ?? field?.label);
        }
    }, [filterLabel, filterRule.label, field?.label]);

    const handleToggleRequired = (checked: boolean) =>
        onChangeFilterRule(
            getFilterRuleWithRequired(
                filterType,
                field,
                filterRule,
                originalFilterRule,
                checked,
            ),
        );

    return (
        <Stack>
            <Stack gap="xs">
                {isEditMode && (
                    <TextInput
                        label="Filter label"
                        mb="sm"
                        size="xs"
                        onChange={(e) => {
                            setFilterLabel(e.target.value);
                            onChangeFilterRule({
                                ...filterRule,
                                label: e.target.value || undefined,
                            });
                        }}
                        placeholder={
                            field ? `Label for ${field.label}` : 'Filter label'
                        }
                        value={filterLabel}
                    />
                )}
                <FilterValueSection
                    isEditMode={isEditMode}
                    isCreatingNew={isCreatingNew}
                    filterType={filterType}
                    field={field}
                    filterRule={filterRule}
                    popoverProps={popoverProps}
                    onChangeFilterRule={onChangeFilterRule}
                />
                {isEditMode && (
                    <RequiredFilterCard
                        filterRule={filterRule}
                        onToggleRequired={handleToggleRequired}
                        onChangeFilterRule={onChangeFilterRule}
                        onEditRules={onEditRequirementRules}
                    />
                )}
            </Stack>
        </Stack>
    );
};

export default FilterSettings;
