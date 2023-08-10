import { Classes, Popover2Props } from '@blueprintjs/popover2';

import { FormGroup } from '@blueprintjs/core';
import {
    applyDefaultTileTargets,
    assertUnreachable,
    createDashboardFilterRuleFromField,
    DashboardFilterRule,
    DashboardTile,
    fieldId,
    FilterableField,
    isField,
    isFilterableField,
    matchFieldByType,
    matchFieldByTypeAndName,
    matchFieldExact,
} from '@lightdash/common';
import {
    Box,
    Button,
    Flex,
    Group,
    Stack,
    Tabs,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconRotate2 } from '@tabler/icons-react';
import produce from 'immer';
import { FC, useCallback, useMemo, useState } from 'react';
import FieldAutoComplete from '../../common/Filters/FieldAutoComplete';
import FieldIcon from '../../common/Filters/FieldIcon';
import FieldLabel from '../../common/Filters/FieldLabel';
import MantineIcon from '../../common/MantineIcon';
import FilterSettings from './FilterSettings';
import TileFilterConfiguration from './TileFilterConfiguration';
import {
    getFilterRuleRevertableObject,
    isFilterConfigRevertButtonEnabled,
    isFilterConfigurationApplyButtonEnabled,
} from './utils';

export enum FilterTabs {
    SETTINGS = 'settings',
    TILES = 'tiles',
}

const DEFAULT_TAB = FilterTabs.SETTINGS;

export enum FilterActions {
    ADD = 'add',
    REMOVE = 'remove',
}

interface Props {
    tiles: DashboardTile[];
    field?: FilterableField;
    fields?: FilterableField[];
    onFieldChange?: (newField: FilterableField) => void;
    availableTileFilters: Record<string, FilterableField[] | undefined>;
    originalFilterRule?: DashboardFilterRule;
    filterRule?: DashboardFilterRule;
    popoverProps?: Popover2Props;
    isEditMode: boolean;
    isCreatingNew?: boolean;
    isTemporary?: boolean;
    onSave: (value: DashboardFilterRule) => void;
}

const FilterConfiguration: FC<Props> = ({
    isEditMode,
    isCreatingNew = false,
    isTemporary = false,
    tiles,
    field,
    fields,
    onFieldChange,
    availableTileFilters,
    originalFilterRule,
    filterRule,
    popoverProps,
    onSave,
}) => {
    const [selectedTabId, setSelectedTabId] = useState<FilterTabs>(DEFAULT_TAB);

    const [internalFilterRule, setInternalFilterRule] = useState<
        DashboardFilterRule | undefined
    >(
        filterRule && field
            ? applyDefaultTileTargets(filterRule, field, availableTileFilters)
            : undefined,
    );

    const isFilterModified = useMemo(() => {
        if (!originalFilterRule || !internalFilterRule) return false;

        return isFilterConfigRevertButtonEnabled(
            originalFilterRule,
            internalFilterRule,
        );
    }, [originalFilterRule, internalFilterRule]);

    const handleChangeField = (newField: FilterableField) => {
        if (!fields || !onFieldChange) return;

        if (newField && isField(newField) && isFilterableField(newField)) {
            setInternalFilterRule(
                createDashboardFilterRuleFromField(
                    newField,
                    availableTileFilters,
                ),
            );
            onFieldChange(newField);
        }
    };

    const handleRevert = useCallback(() => {
        if (!originalFilterRule) return;

        setInternalFilterRule((rule) =>
            rule
                ? {
                      ...rule,
                      ...getFilterRuleRevertableObject(originalFilterRule),
                  }
                : undefined,
        );
    }, [originalFilterRule]);

    const handleChangeFilterRule = useCallback(
        (newFilterRule: DashboardFilterRule) => {
            setInternalFilterRule(newFilterRule);
        },
        [],
    );

    const handleChangeTileConfiguration = useCallback(
        (action: FilterActions, tileUuid: string, filter?: FilterableField) => {
            const filters = availableTileFilters[tileUuid];
            if (!filters) return;

            setInternalFilterRule((prevState) =>
                produce(prevState, (draftState) => {
                    if (!draftState || !field) return;

                    draftState.tileTargets = draftState.tileTargets ?? {};

                    if (action === FilterActions.ADD) {
                        const filterableField =
                            filter ??
                            filters.find(matchFieldExact(field)) ??
                            filters.find(matchFieldByTypeAndName(field)) ??
                            filters.find(matchFieldByType(field));

                        if (!filterableField) return draftState;

                        draftState.tileTargets[tileUuid] = {
                            fieldId: fieldId(filterableField),
                            tableName: filterableField.table,
                        };
                    } else if (action === FilterActions.REMOVE) {
                        delete draftState.tileTargets[tileUuid];
                    } else {
                        return assertUnreachable(
                            action,
                            'Invalid FilterActions',
                        );
                    }
                }),
            );
        },
        [field, availableTileFilters],
    );

    return (
        <Stack>
            <Tabs
                value={selectedTabId}
                onTabChange={(tabId: FilterTabs) => setSelectedTabId(tabId)}
            >
                {isCreatingNew || isEditMode || isTemporary ? (
                    <Tabs.List mb="md">
                        <Tooltip
                            label="Select the value you want to filter your dimension by"
                            position="top-start"
                        >
                            <Tabs.Tab value={FilterTabs.SETTINGS}>
                                Settings
                            </Tabs.Tab>
                        </Tooltip>

                        <Tooltip
                            label="Select tiles to apply filter to and which field to filter by"
                            position="top-start"
                        >
                            <Tabs.Tab
                                value={FilterTabs.TILES}
                                disabled={!field}
                            >
                                Tiles
                            </Tabs.Tab>
                        </Tooltip>
                    </Tabs.List>
                ) : null}

                <Tabs.Panel value={FilterTabs.SETTINGS} w={350}>
                    <Stack>
                        {!!fields && isCreatingNew ? (
                            <FormGroup
                                style={{ marginBottom: '5px' }}
                                label={
                                    <Text fw={500}>
                                        Select a dimension to filter{' '}
                                        <Text color="red" span>
                                            *
                                        </Text>{' '}
                                    </Text>
                                }
                                labelFor="field-autocomplete"
                            >
                                <FieldAutoComplete
                                    hasGrouping
                                    id="field-autocomplete"
                                    fields={fields}
                                    activeField={field}
                                    onChange={handleChangeField}
                                    popoverProps={{
                                        lazy: true,
                                        matchTargetWidth: true,
                                        captureDismiss: !popoverProps?.isOpen,
                                        canEscapeKeyClose:
                                            !popoverProps?.isOpen,
                                        ...popoverProps,
                                    }}
                                />
                            </FormGroup>
                        ) : (
                            field && (
                                <Group spacing="xs">
                                    <FieldIcon item={field} />
                                    <FieldLabel item={field} />
                                </Group>
                            )
                        )}

                        {!!field && internalFilterRule && (
                            <FilterSettings
                                isEditMode={isEditMode}
                                field={field}
                                filterRule={internalFilterRule}
                                onChangeFilterRule={handleChangeFilterRule}
                                popoverProps={popoverProps}
                            />
                        )}
                    </Stack>
                </Tabs.Panel>

                {!!field && internalFilterRule && (
                    <Tabs.Panel value={FilterTabs.TILES} w={500}>
                        <TileFilterConfiguration
                            field={field}
                            filterRule={internalFilterRule}
                            popoverProps={popoverProps}
                            tiles={tiles}
                            availableTileFilters={availableTileFilters}
                            onChange={handleChangeTileConfiguration}
                        />
                    </Tabs.Panel>
                )}
            </Tabs>

            <Flex gap="sm">
                <Box sx={{ flexGrow: 1 }} />

                {!isTemporary &&
                    isFilterModified &&
                    selectedTabId === FilterTabs.SETTINGS && (
                        <Tooltip
                            label="Reset to original value"
                            position="left"
                        >
                            <Button
                                size="xs"
                                variant="default"
                                color="gray"
                                onClick={handleRevert}
                            >
                                <MantineIcon icon={IconRotate2} />
                            </Button>
                        </Tooltip>
                    )}

                <Button
                    size="xs"
                    variant="filled"
                    className={Classes.POPOVER2_DISMISS}
                    disabled={
                        !isFilterConfigurationApplyButtonEnabled(
                            internalFilterRule,
                        )
                    }
                    onClick={() => {
                        setSelectedTabId(FilterTabs.SETTINGS);
                        if (!!internalFilterRule) onSave(internalFilterRule);
                    }}
                >
                    Apply
                </Button>
            </Flex>
        </Stack>
    );
};

export default FilterConfiguration;
