import {
    fieldId as getFieldId,
    isDashboardChartTileType,
    matchFieldByType,
    matchFieldByTypeAndName,
    matchFieldExact,
    type DashboardFilterRule,
    type DashboardTab,
    type DashboardTile,
    type Field,
} from '@lightdash/common';
import {
    Accordion,
    Box,
    Checkbox,
    Flex,
    Stack,
    Switch,
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
    tabs: DashboardTab[];
    activeTabUuid: string | undefined;
    availableTileFilters: Record<string, Field[] | undefined>;
    field: Field;
    filterRule: DashboardFilterRule;
    popoverProps?: Omit<PopoverProps, 'children'>;
    onChange: (action: FilterActions, tileUuid: string, field?: Field) => void;
    onToggleAll: (checked: boolean, tileUuids: string[]) => void;
};

const TileFilterConfiguration: FC<Props> = ({
    tiles,
    tabs,
    activeTabUuid,
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
            const tabUuidFromTile = tile?.tabUuid;

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
                tabUuid: tabUuidFromTile,
            };
        });
    }, [filterRule, field, sortFieldsByMatch, sortedTileWithFilters, tiles]);

    const filteredTileTargetList = (tabUUid: string) => {
        return tileTargetList.filter((v) => v.tabUuid === tabUUid);
    };

    const SwitchToggle = ({
        tileList,
        tabName,
    }: {
        tileList: any[];
        tabName: string;
    }) => {
        const isAllChecked = tileList.every(({ checked }) => checked);
        const isIndeterminate =
            !isAllChecked && tileList.some(({ checked }) => checked);
        const tileUuids = tileList.map((tile) => tile.tileUuid);
        const shouldBeChecked = isAllChecked || isIndeterminate;
        const tooltipLabel = shouldBeChecked
            ? `Toggle off to turn filter off for tab '${tabName}'`
            : `Turn on to turn filter on for tab '${tabName}'`;

        return (
            <Tooltip label={tooltipLabel} position="right">
                <Switch
                    size="sm"
                    checked={shouldBeChecked}
                    styles={{
                        label: {
                            paddingRight: theme.spacing.xs,
                        },
                    }}
                    onChange={() => {
                        if (isIndeterminate) {
                            onToggleAll(false, tileUuids);
                        } else {
                            onToggleAll(!isAllChecked, tileUuids);
                        }
                    }}
                />
            </Tooltip>
        );
    };

    const StackSubComponent = ({ tileList }: { tileList: any[] }) => {
        return (
            <Stack spacing="lg">
                <Stack spacing="md">
                    {tileList.map((value) => (
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
                                        withinPortal={
                                            popoverProps?.withinPortal
                                        }
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

    return tabs.length > 0 ? (
        <Accordion defaultValue={activeTabUuid} variant="contained">
            {tabs.map((tab, index) => (
                <Flex align="center" gap="sm" key={index}>
                    <Accordion.Item
                        key={index}
                        value={tab.uuid}
                        style={{ flexGrow: 1 }}
                    >
                        <Accordion.Control
                            fw={500}
                            style={{ fontSize: '14px', fontWeight: 500 }}
                        >
                            {tab.name}
                        </Accordion.Control>
                        <Accordion.Panel>
                            <StackSubComponent
                                tileList={filteredTileTargetList(tab.uuid)}
                            />
                        </Accordion.Panel>
                    </Accordion.Item>
                    <SwitchToggle
                        tileList={filteredTileTargetList(tab.uuid)}
                        tabName={tab.name}
                    />
                </Flex>
            ))}
        </Accordion>
    ) : (
        <StackSubComponent tileList={tileTargetList} />
    );
};

export default TileFilterConfiguration;
