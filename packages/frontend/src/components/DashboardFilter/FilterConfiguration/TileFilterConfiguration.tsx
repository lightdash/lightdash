import {
    fieldId as getFieldId,
    isDashboardChartTileType,
    matchFieldByType,
    matchFieldByTypeAndName,
    matchFieldExact,
    type DashboardFilterRule,
    type DashboardTile,
    type Field,
} from '@lightdash/common';
import {
    Box,
    Checkbox,
    Flex,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
    type PopoverProps,
} from '@mantine/core';
import { useCallback, useMemo, type FC } from 'react';
import { FilterActions } from '.';
import FieldSelect from '../../common/FieldSelect';
import MantineIcon from '../../common/MantineIcon';
import { getChartIcon } from '../../common/ResourceIcon';

type Props = {
    tiles: DashboardTile[];
    availableTileFilters: Record<string, Field[] | undefined>;
    field: Field;
    filterRule: DashboardFilterRule;
    popoverProps?: Omit<PopoverProps, 'children'>;
    onChange: (action: FilterActions, tileUuid: string, field?: Field) => void;
    onToggleAll: (checked: boolean) => void;
};

const TileFilterConfiguration: FC<Props> = ({
    tiles,
    field,
    filterRule,
    availableTileFilters,
    popoverProps,
    onChange,
    onToggleAll,
}) => {
    const theme = useMantineTheme();

    const sortTilesByFieldMatch = useCallback(
        (
            fieldMatcher: (a: Field) => (b: Field) => boolean,
            a: Field[] | undefined,
            b: Field[] | undefined,
        ) => {
            if (!a || !b) return 0;

            const matchA = a.some(fieldMatcher(field));
            const matchB = b.some(fieldMatcher(field));
            return matchA === matchB ? 0 : matchA ? -1 : 1;
        },
        [field],
    );

    const sortFieldsByMatch = useCallback(
        (
            fieldMatcher: (a: Field) => (b: Field) => boolean,
            a: Field,
            b: Field,
        ) => {
            const matchA = fieldMatcher(field)(a);
            const matchB = fieldMatcher(field)(b);
            return matchA === matchB ? 0 : matchA ? -1 : 1;
        },
        [field],
    );

    const sortedTileWithFilters = useMemo(() => {
        return Object.entries(availableTileFilters)
            .sort(([, a], [, b]) =>
                sortTilesByFieldMatch(matchFieldByTypeAndName, a, b),
            )
            .sort(([, a], [, b]) =>
                sortTilesByFieldMatch(matchFieldExact, a, b),
            );
    }, [sortTilesByFieldMatch, availableTileFilters]);

    const tileTargetList = useMemo(() => {
        return sortedTileWithFilters.map(([tileUuid, filters], index) => {
            const tile = tiles.find((t) => t.uuid === tileUuid);

            // tileConfig overrides the default filter state for a tile
            // if it is a field, we use that field for the filter.
            // If it is the empty string, the filter is disabled.
            const tileConfig = filterRule.tileTargets?.[tileUuid];

            let selectedField;
            let invalidField: string | undefined;
            if (tileConfig !== false) {
                selectedField = tileConfig?.fieldId
                    ? filters?.find(
                          (f) => tileConfig?.fieldId === getFieldId(f),
                      )
                    : filters?.find((f) => matchFieldExact(f)(field));

                // If tileConfig?.fieldId is set, but the field is not found in the filters, we mark it as invalid filter (missing dimension in model)
                invalidField =
                    tileConfig?.fieldId !== undefined &&
                    selectedField === undefined
                        ? tileConfig?.fieldId
                        : undefined;
            }

            const isFilterAvailable =
                filters?.some(matchFieldByType(field)) ?? false;

            const sortedFilters = filters
                ?.filter(matchFieldByType(field))
                .sort((a, b) =>
                    sortFieldsByMatch(matchFieldByTypeAndName, a, b),
                )
                .sort((a, b) => sortFieldsByMatch(matchFieldExact, a, b));

            const tileWithoutTitle =
                !tile?.properties.title || tile.properties.title.length === 0;
            const isChartTileType = tile && isDashboardChartTileType(tile);

            let tileLabel = '';
            if (tile) {
                if (tileWithoutTitle && isChartTileType) {
                    tileLabel = tile.properties.chartName || '';
                } else if (tile.properties.title) {
                    tileLabel = tile.properties.title;
                }
            }

            return {
                key: tileUuid + index,
                label: tileLabel,
                checked: !!selectedField,
                disabled: !isFilterAvailable,
                invalidField,
                tileUuid,
                ...(tile &&
                    isDashboardChartTileType(tile) && {
                        tileChartKind:
                            tile.properties.lastVersionChartKind ?? undefined,
                    }),
                sortedFilters,
                selectedField,
            };
        });
    }, [filterRule, field, sortFieldsByMatch, sortedTileWithFilters, tiles]);

    const isAllChecked = tileTargetList.every(({ checked }) => checked);
    const isIndeterminate =
        !isAllChecked && tileTargetList.some(({ checked }) => checked);

    return (
        <Stack spacing="lg">
            <Checkbox
                size="xs"
                checked={isAllChecked}
                indeterminate={isIndeterminate}
                label={
                    <Text fw={500}>
                        Select all{' '}
                        {isIndeterminate
                            ? ` (${
                                  tileTargetList.filter((v) => v.checked).length
                              } charts selected)`
                            : ''}
                    </Text>
                }
                styles={{
                    label: {
                        paddingLeft: theme.spacing.xs,
                    },
                }}
                onChange={() => {
                    if (isIndeterminate) {
                        onToggleAll(false);
                    } else {
                        onToggleAll(!isAllChecked);
                    }
                }}
            />
            <Stack spacing="md">
                {tileTargetList.map((value) => (
                    <Box key={value.key}>
                        <Tooltip
                            label={
                                value.invalidField
                                    ? `The selected field ${value.invalidField} is not valid`
                                    : 'No fields matching filter type'
                            }
                            position="left"
                            disabled={
                                !value.disabled &&
                                value.invalidField === undefined
                            }
                        >
                            <Box>
                                <Checkbox
                                    size="xs"
                                    fw={500}
                                    disabled={value.disabled}
                                    label={
                                        <Flex align="center" gap="xxs">
                                            <MantineIcon
                                                color="blue.8"
                                                icon={getChartIcon(
                                                    value.tileChartKind,
                                                )}
                                            />
                                            <Text
                                                color={
                                                    value.invalidField
                                                        ? 'red'
                                                        : undefined
                                                }
                                            >
                                                {value.label}
                                            </Text>
                                        </Flex>
                                    }
                                    styles={{
                                        label: {
                                            paddingLeft: theme.spacing.xs,
                                        },
                                    }}
                                    checked={value.checked}
                                    onChange={(event) => {
                                        onChange(
                                            event.currentTarget.checked
                                                ? FilterActions.ADD
                                                : FilterActions.REMOVE,
                                            value.tileUuid,
                                        );
                                    }}
                                />
                            </Box>
                        </Tooltip>

                        {value.sortedFilters && (
                            <Box
                                ml="xl"
                                mt="sm"
                                display={!value.checked ? 'none' : 'auto'}
                            >
                                <FieldSelect
                                    size="xs"
                                    disabled={!value.checked}
                                    item={value.selectedField}
                                    items={value.sortedFilters}
                                    withinPortal={popoverProps?.withinPortal}
                                    onDropdownOpen={popoverProps?.onOpen}
                                    onDropdownClose={popoverProps?.onClose}
                                    onChange={(newField) => {
                                        onChange(
                                            FilterActions.ADD,
                                            value.tileUuid,
                                            newField,
                                        );
                                    }}
                                />
                            </Box>
                        )}
                    </Box>
                ))}
            </Stack>
        </Stack>
    );
};

export default TileFilterConfiguration;
