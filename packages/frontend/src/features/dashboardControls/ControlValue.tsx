import {
    DimensionType,
    FieldType,
    FilterType,
    getItemId,
    isLightdashParameterOption,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type FilterableDimension,
    type LightdashProjectParameter,
    type ParameterValue,
} from '@lightdash/common';
import { Select, Stack, Text, type PopoverProps } from '@mantine/core';
import { useMemo, type FC } from 'react';
import FiltersProvider from '../../components/common/Filters/FiltersProvider';
import { useProject } from '../../hooks/useProject';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import FilterSettings from '../dashboardFilters/FilterConfiguration/FilterSettings';
import { hasFilterValueSet } from '../dashboardFilters/FilterConfiguration/utils';
import { useFilterBarPopovers } from '../dashboardFilters/FilterRequirements/useFilterBarPopovers';
import { ParameterInput } from '../parameters/components/ParameterInput';
import { type ControlModel } from './context';
import {
    getDraftSettingsField,
    getFilterTypeForControl,
    type ControlType,
} from './controlType';
import { formatDisplayLabel } from './labels';
import { getParameterType } from './parameterMapping';
import { useFieldValueLists } from './useFieldValueLists';

const NO_FIELDS: DashboardFilterableField[] = [];

// Joins ids or values into a string that is stable across renders
const SEPARATOR = '\u0000';

const withSuggestions = <T extends object>(
    field: T,
    suggestions: string[],
): T => Object.assign({}, field, { suggestions });

// Today's filter settings, driven by the control's own field once it has one
export const FilterControlValue: FC<{
    // The pending copy of the control's rule
    rule: DashboardFilterRule;
    controlType: ControlType;
    isNew: boolean;
    // A temporary filter has a value only, as in today's view-mode popover
    isTemporary: boolean;
    model: ControlModel;
    onChange: (rule: DashboardFilterRule) => void;
    // How dropdowns inside behave in the popover that holds the settings
    popoverProps: Pick<PopoverProps, 'onOpen' | 'onClose' | 'withinPortal'>;
}> = ({
    rule,
    controlType,
    isNew,
    isTemporary,
    model,
    onChange,
    popoverProps,
}) => {
    const filterType = getFilterTypeForControl(controlType);
    const projectUuid = useProjectUuid();
    const project = useProject(projectUuid);
    const filterBarPopovers = useFilterBarPopovers();
    const dashboard = useDashboardContext((c) => c.dashboard);
    const allFilters = useDashboardContext((c) => c.allFilters);
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const activeTabUuid = useDashboardContext((c) => c.activeTab?.uuid);
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );

    const ownId = model.field ? getItemId(model.field) : null;
    const rowIdsKey = model.overview.rows.map((row) => row.id).join(SEPARATOR);

    // The other fields a text control is mapped to: their values join the
    // suggestions of the control's own field
    const otherFields = useMemo(() => {
        if (filterType !== FilterType.STRING || ownId === null) {
            return NO_FIELDS;
        }
        const rowIds = rowIdsKey.split(SEPARATOR);
        const seen = new Map<string, DashboardFilterableField>();
        Object.values(filterableFieldsByTileUuid ?? {}).forEach((fields) =>
            fields.forEach((f) => {
                const id = getItemId(f);
                if (id !== ownId && rowIds.includes(id) && !seen.has(id)) {
                    seen.set(id, f);
                }
            }),
        );
        return [...seen.values()];
    }, [filterType, ownId, rowIdsKey, filterableFieldsByTileUuid]);

    const otherValuesKey = [
        ...new Set(
            useFieldValueLists(
                projectUuid,
                otherFields,
                parameterValues,
            ).flatMap((values) => values ?? []),
        ),
    ].join(SEPARATOR);
    const otherValues = useMemo(
        () => (otherValuesKey === '' ? [] : otherValuesKey.split(SEPARATOR)),
        [otherValuesKey],
    );

    const combined = useMemo(() => {
        if (ownId === null || otherValues.length === 0) return null;
        const own = allFilterableFieldsMap[ownId];
        return {
            itemsMap: own
                ? {
                      ...allFilterableFieldsMap,
                      [ownId]: withSuggestions(own, otherValues),
                  }
                : allFilterableFieldsMap,
            fieldsByTile: Object.fromEntries(
                Object.entries(filterableFieldsByTileUuid ?? {}).map(
                    ([tileUuid, fields]) => [
                        tileUuid,
                        fields.map((f) =>
                            getItemId(f) === ownId
                                ? withSuggestions(f, otherValues)
                                : f,
                        ),
                    ],
                ),
            ),
        };
    }, [
        ownId,
        otherValues,
        allFilterableFieldsMap,
        filterableFieldsByTileUuid,
    ]);

    const originalFilterRule = useMemo(
        () =>
            [
                ...(dashboard?.filters.dimensions ?? []),
                ...(dashboard?.filters.metrics ?? []),
            ].find((item) => item.id === rule.id),
        [dashboard, rule.id],
    );

    const handleChange = (newRule: DashboardFilterRule) => {
        const hasValue = hasFilterValueSet(newRule);
        // While viewing, a cleared value means any value
        const isWithoutValue = isTemporary
            ? !newRule.required && !hasValue
            : (!!newRule.required || !!newRule.requiredGroupId) && !hasValue;
        onChange({
            ...newRule,
            disabled: (newRule.disabled && !hasValue) || isWithoutValue,
        });
    };

    const fieldCount = model.overview.rows.length;

    return (
        <FiltersProvider
            projectUuid={projectUuid}
            itemsMap={combined?.itemsMap ?? allFilterableFieldsMap}
            startOfWeek={
                project.data?.warehouseConnection?.startOfWeek ?? undefined
            }
            dashboardFilters={allFilters}
            dashboardTiles={dashboardTiles}
            filterableFieldsByTileUuid={
                combined?.fieldsByTile ?? filterableFieldsByTileUuid
            }
            activeTabUuid={activeTabUuid}
            parameterValues={parameterValues}
        >
            <FilterSettings
                // Remounts when the control's own field changes
                key={`${rule.id}:${ownId ?? ''}`}
                isEditMode={!isTemporary}
                hideLabel
                isCreatingNew={isNew}
                filterType={filterType}
                field={model.field ?? getDraftSettingsField(controlType)}
                filterRule={rule}
                originalFilterRule={originalFilterRule}
                popoverProps={popoverProps}
                onChangeFilterRule={handleChange}
                onEditRequirementRules={
                    isNew || isTemporary
                        ? undefined
                        : filterBarPopovers?.openRulesPopover
                }
                valueHint={
                    filterType === FilterType.STRING && fieldCount > 1 ? (
                        <Text fz="xs" c="dimmed">
                            {`Options combined from ${fieldCount} fields.`}
                        </Text>
                    ) : undefined
                }
            />
        </FiltersProvider>
    );
};

const PARAMETER_DIMENSION_TYPES: Record<string, DimensionType> = {
    string: DimensionType.STRING,
    number: DimensionType.NUMBER,
    date: DimensionType.DATE,
};

// The dimension a parameter takes its options from, as a field to look up
const toOptionsField = (
    definition: LightdashProjectParameter | undefined,
): FilterableDimension | null => {
    const source = definition?.options_from_dimension;
    if (!source || !definition) return null;
    return {
        name: source.dimension,
        table: source.model,
        fieldType: FieldType.DIMENSION,
        type: PARAMETER_DIMENSION_TYPES[getParameterType(definition)],
        label: definition.label || source.dimension,
        tableLabel: source.model,
        sql: '',
        hidden: false,
    };
};

type CombinedOption = { value: string | number; label: string | null };

// Today's parameter input. With several parameters mapped it offers the
// options of all of them together.
export const ParameterControlValue: FC<{
    // The control's parameters, and the pending copy of its value
    keys: string[];
    value: ParameterValue | null;
    model: ControlModel;
    onChange: (value: ParameterValue | null) => void;
}> = ({ keys, value, model, onChange }) => {
    const projectUuid = useProjectUuid();
    const definitions = useDashboardContext((c) => c.parameterDefinitions);
    const parameterValues = useDashboardContext((c) => c.parameterValues);

    const isCombined = keys.length > 1;

    // One lookup per parameter whose options come from a dimension
    const sourced = useMemo(
        () =>
            (isCombined ? keys : []).flatMap((key) => {
                const field = toOptionsField(definitions[key]);
                return field ? [{ key, field }] : [];
            }),
        [isCombined, keys, definitions],
    );
    const sourcedLists = useFieldValueLists(
        projectUuid,
        sourced.map(({ field }) => field),
        parameterValues,
    );

    if (keys.length === 0) {
        return (
            <Select
                size="xs"
                label="Value"
                placeholder="Add a tile to set a value"
                data={[]}
                disabled
            />
        );
    }

    const first = definitions[keys[0]];
    if (!first) return null;

    const optionsByKey = keys.map((key) => {
        const definition = definitions[key];
        const fixed: CombinedOption[] = (definition?.options ?? []).map(
            (option) =>
                isLightdashParameterOption(option)
                    ? { value: option.value, label: option.label }
                    : { value: option, label: null },
        );
        const sourceIndex = sourced.findIndex((s) => s.key === key);
        const fetched: CombinedOption[] = (
            sourceIndex >= 0 ? (sourcedLists[sourceIndex] ?? []) : []
        ).map((value) => ({ value, label: null }));
        return {
            key,
            isOpen: !!definition?.allow_custom_values,
            options: [...fixed, ...fetched],
        };
    });

    const union = new Map<string, CombinedOption>();
    optionsByKey.forEach(({ options }) =>
        options.forEach((option) => {
            const id = String(option.value);
            if (
                !union.has(id) ||
                (union.get(id)?.label === null && option.label)
            ) {
                union.set(id, option);
            }
        }),
    );
    const unionOptions = [...union.values()];
    const hasLabels = unionOptions.some((option) => option.label !== null);

    // Parameters that do not offer every combined value
    const uneven = optionsByKey.filter(
        ({ isOpen, options }) =>
            !isOpen &&
            unionOptions.some(
                (option) =>
                    !options.some(
                        (own) => String(own.value) === String(option.value),
                    ),
            ),
    );

    const parameter: LightdashProjectParameter = isCombined
        ? {
              ...first,
              options_from_dimension: undefined,
              allow_custom_values: optionsByKey.some(({ isOpen }) => isOpen),
              options: hasLabels
                  ? unionOptions.map((option) => ({
                        value: option.value,
                        label: option.label ?? String(option.value),
                    }))
                  : getParameterType(first) === 'number'
                    ? unionOptions.map((option) => Number(option.value))
                    : unionOptions.map((option) => String(option.value)),
          }
        : first;

    return (
        <Stack gap="xs">
            <Text fz="xs" fw={500}>
                Value
            </Text>
            <ParameterInput
                paramKey={keys[0]}
                parameter={parameter}
                value={value}
                onParameterChange={(_key, newValue) => onChange(newValue)}
                size="xs"
                projectUuid={projectUuid}
                parameterValues={parameterValues}
            />
            {isCombined && unionOptions.length > 0 && (
                <Text fz="xs" c="dimmed">
                    {`Options combined from ${keys.length} parameters.`}
                    {uneven.length > 0 && (
                        <Text span inherit c="red">
                            {` Not every value exists on ${uneven
                                .map(({ key }) =>
                                    model.rowLabels[key]
                                        ? formatDisplayLabel(
                                              model.rowLabels[key],
                                          )
                                        : key,
                                )
                                .join(' and ')}.`}
                        </Text>
                    )}
                </Text>
            )}
        </Stack>
    );
};
