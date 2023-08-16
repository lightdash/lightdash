import { Classes, Popover2Props } from '@blueprintjs/popover2';

import { FormGroup } from '@blueprintjs/core';
import {
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
    useMantineTheme,
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
    draftFilterRule?: DashboardFilterRule;
    onChangeDraftFilterRule: (value?: DashboardFilterRule) => void;
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
    draftFilterRule,
    onChangeDraftFilterRule,
    popoverProps,
    onSave,
}) => {
    const theme = useMantineTheme();
    const [selectedTabId, setSelectedTabId] = useState<FilterTabs>(DEFAULT_TAB);

    const isFilterModified = useMemo(() => {
        if (!originalFilterRule || !draftFilterRule) return false;

        return isFilterConfigRevertButtonEnabled(
            originalFilterRule,
            draftFilterRule,
        );
    }, [originalFilterRule, draftFilterRule]);

    const handleChangeField = (newField: FilterableField) => {
        if (!fields || !onFieldChange) return;

        if (newField && isField(newField) && isFilterableField(newField)) {
            onChangeDraftFilterRule(
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

        onChangeDraftFilterRule(
            draftFilterRule
                ? {
                      ...draftFilterRule,
                      ...getFilterRuleRevertableObject(originalFilterRule),
                  }
                : undefined,
        );
    }, [originalFilterRule, onChangeDraftFilterRule, draftFilterRule]);

    const handleChangeFilterRule = useCallback(
        (newFilterRule: DashboardFilterRule) => {
            onChangeDraftFilterRule(newFilterRule);
        },
        [onChangeDraftFilterRule],
    );

    const handleChangeTileConfiguration = useCallback(
        (action: FilterActions, tileUuid: string, filter?: FilterableField) => {
            const filters = availableTileFilters[tileUuid];
            if (!filters) return;

            onChangeDraftFilterRule(
                produce(draftFilterRule, (draftState) => {
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
        [field, availableTileFilters, onChangeDraftFilterRule, draftFilterRule],
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
                                Filter Settings
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
                                Chart tiles
                            </Tabs.Tab>
                        </Tooltip>
                    </Tabs.List>
                ) : null}

                <Tabs.Panel value={FilterTabs.SETTINGS} w={350}>
                    <Stack spacing="sm">
                        {!!fields && isCreatingNew ? (
                            <FormGroup
                                style={{ marginBottom: '5px' }}
                                label={
                                    <Text size="xs" fw={500}>
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
                                    inputProps={{
                                        // TODO: Remove once this component is migrated to Mantine
                                        style: {
                                            borderRadius: '4px',
                                            borderWidth: '1px',
                                            boxShadow: 'none',
                                            fontSize: theme.fontSizes.xs,
                                        },
                                    }}
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

                        {!!field && draftFilterRule && (
                            <FilterSettings
                                isEditMode={isEditMode}
                                isCreatingNew={isCreatingNew}
                                field={field}
                                filterRule={draftFilterRule}
                                onChangeFilterRule={handleChangeFilterRule}
                                popoverProps={popoverProps}
                            />
                        )}
                    </Stack>
                </Tabs.Panel>

                {!!field && draftFilterRule && (
                    <Tabs.Panel value={FilterTabs.TILES} w={500}>
                        <TileFilterConfiguration
                            field={field}
                            filterRule={draftFilterRule}
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

                <Tooltip
                    label="Filter field and value required"
                    disabled={isFilterConfigurationApplyButtonEnabled(
                        draftFilterRule,
                    )}
                >
                    <Box>
                        <Button
                            size="xs"
                            variant="filled"
                            className={Classes.POPOVER2_DISMISS}
                            disabled={
                                !isFilterConfigurationApplyButtonEnabled(
                                    draftFilterRule,
                                )
                            }
                            onClick={() => {
                                setSelectedTabId(FilterTabs.SETTINGS);
                                if (!!draftFilterRule) onSave(draftFilterRule);
                            }}
                        >
                            Apply
                        </Button>
                    </Box>
                </Tooltip>
            </Flex>
        </Stack>
    );
};

export default FilterConfiguration;
