import {
    FilterInteractivityValues,
    assertUnreachable,
    getFilterInteractivityValue,
    getItemId,
    isDashboardChartTileType,
    type DashboardFilterInteractivityOptions,
    type SavedChartsInfoForDashboardAvailableFilters,
} from '@lightdash/common';
import { Checkbox, Flex, Group, Select, Stack, Text } from '@mantine/core';
import { useCallback, useMemo } from 'react';
import { type FieldsWithSuggestions } from '../../../../components/Explorer/FiltersCard/useFieldsWithSuggestions';
import { getConditionalRuleLabelFromItem } from '../../../../components/common/Filters/FilterInputs/utils';
import {
    useDashboardQuery,
    useDashboardsAvailableFilters,
} from '../../../../hooks/dashboard/useDashboard';

type Props = {
    dashboardUuid?: string;
    interactivityOptions: DashboardFilterInteractivityOptions;
    onInteractivityOptionsChange: (
        interactivityOptions: DashboardFilterInteractivityOptions,
    ) => void;
};

function getFilterInteractivityValueLabel(value: FilterInteractivityValues) {
    switch (value) {
        case FilterInteractivityValues.some:
            return 'Some filters';
        case FilterInteractivityValues.all:
            return 'All filters';
        case FilterInteractivityValues.none:
            return 'No filters';
        default:
            return assertUnreachable(
                value,
                `Unknown FilterInteractivityValue ${value}`,
            );
    }
}

const EmbedFiltersInteractivity: React.FC<Props> = ({
    dashboardUuid,
    interactivityOptions,
    onInteractivityOptionsChange,
}) => {
    const { data: dashboard } = useDashboardQuery(dashboardUuid);
    const dashboardFilters = useMemo(() => {
        return Object.values(dashboard?.filters || {}).flat();
    }, [dashboard]);

    const savedChartUuidsAndTileUuids = useMemo(
        () =>
            dashboard?.tiles
                ?.filter(isDashboardChartTileType)
                .reduce<SavedChartsInfoForDashboardAvailableFilters>(
                    (acc, tile) => {
                        if (tile.properties.savedChartUuid) {
                            acc.push({
                                tileUuid: tile.uuid,
                                savedChartUuid: tile.properties.savedChartUuid,
                            });
                        }
                        return acc;
                    },
                    [],
                ) || [],
        [dashboard?.tiles],
    );

    const { data: availableTileFilters } = useDashboardsAvailableFilters(
        savedChartUuidsAndTileUuids,
    );

    const fieldsWithSuggestions = useMemo(() => {
        return availableTileFilters &&
            availableTileFilters.allFilterableFields &&
            availableTileFilters.allFilterableFields.length > 0
            ? availableTileFilters.allFilterableFields.reduce<FieldsWithSuggestions>(
                  (sum, field) => ({
                      ...sum,
                      [getItemId(field)]: field,
                  }),
                  {},
              )
            : {};
    }, [availableTileFilters]);

    const setInteractivityOptions = useCallback(
        ({
            enabled: newEnabledValue,
            allowedFilters: newAllowedFilters,
        }: {
            enabled?: FilterInteractivityValues;
            allowedFilters?: string[];
        }) => {
            const enabled = getFilterInteractivityValue(
                newEnabledValue ?? interactivityOptions.enabled,
            );

            let allowedFilters;

            switch (enabled) {
                case FilterInteractivityValues.some:
                    allowedFilters =
                        newAllowedFilters ??
                        interactivityOptions.allowedFilters;
                    break;
                case FilterInteractivityValues.none:
                case FilterInteractivityValues.all:
                    break;
                default:
                    return assertUnreachable(
                        enabled,
                        `Unknown FilterInteractivityValue ${enabled}`,
                    );
            }

            onInteractivityOptionsChange({
                enabled,
                allowedFilters,
            });
        },
        [
            interactivityOptions.enabled,
            interactivityOptions.allowedFilters,
            onInteractivityOptionsChange,
        ],
    );

    return (
        <Stack mt="sm">
            <Flex align="center" gap="sm">
                <Text size="sm">Users can change:</Text>
                <Select
                    defaultValue={FilterInteractivityValues.none}
                    onChange={(value: FilterInteractivityValues) => {
                        setInteractivityOptions({ enabled: value });
                    }}
                    data={[
                        {
                            value: FilterInteractivityValues.none,
                            label: getFilterInteractivityValueLabel(
                                FilterInteractivityValues.none,
                            ),
                        },
                        {
                            value: FilterInteractivityValues.some,
                            label: getFilterInteractivityValueLabel(
                                FilterInteractivityValues.some,
                            ),
                        },
                        {
                            value: FilterInteractivityValues.all,
                            label: getFilterInteractivityValueLabel(
                                FilterInteractivityValues.all,
                            ),
                        },
                    ]}
                />
            </Flex>
            {interactivityOptions.enabled ===
                FilterInteractivityValues.some && (
                <Checkbox.Group
                    value={interactivityOptions.allowedFilters || []}
                    onChange={(values) => {
                        setInteractivityOptions({ allowedFilters: values });
                    }}
                >
                    <Group spacing="lg">
                        {dashboardFilters &&
                            dashboardFilters.map((filter) => {
                                const field =
                                    fieldsWithSuggestions[
                                        filter.target.fieldId
                                    ];

                                if (!field) return;

                                const labels = getConditionalRuleLabelFromItem(
                                    filter,
                                    field,
                                );

                                return (
                                    <Checkbox
                                        key={filter.id}
                                        value={filter.id}
                                        label={
                                            <>
                                                <Text fw={600} span>
                                                    {labels.field}{' '}
                                                </Text>
                                                {filter.disabled ? (
                                                    <Text span color="gray.6">
                                                        is any value
                                                    </Text>
                                                ) : (
                                                    <>
                                                        <Text
                                                            span
                                                            color="gray.7"
                                                        >
                                                            {labels.operator}{' '}
                                                        </Text>
                                                        <Text fw={700} span>
                                                            {labels.value}
                                                        </Text>
                                                    </>
                                                )}
                                            </>
                                        }
                                    />
                                );
                            })}
                    </Group>
                </Checkbox.Group>
            )}
        </Stack>
    );
};

export default EmbedFiltersInteractivity;
