import {
    getItemId,
    isFilterableField,
    type FilterRule,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconAlertCircle, IconPlus, IconX } from '@tabler/icons-react';
import { memo, useCallback, useMemo, type FC } from 'react';
import { useToggle } from 'react-use';
import { explorerActions } from '../../../features/explorer/store/explorerSlice';
import type { FilterTreeState } from '../../../features/explorer/store/filterTree';
import { useExplorerDispatch } from '../../../features/explorer/store/hooks';
import {
    type FieldWithSuggestions,
    type FieldsWithSuggestions,
} from '../../Explorer/FiltersCard/useFieldsWithSuggestions';
import FieldSelect from '../FieldSelect';
import MantineIcon from '../MantineIcon';
import { FILTER_SELECT_LIMIT } from './constants';
import FilterGroupForm from './FilterGroupForm';
import SimplifiedFilterGroupForm from './SimplifiedFilterGroupForm';
import useFiltersContext from './useFiltersContext';

type Props = {
    filterTree: FilterTreeState;
    isEditMode: boolean;
};

const getInvalidFilterRules = (
    fields: FieldWithSuggestions[],
    filterRules: FilterRule[],
) =>
    filterRules.reduce<FilterRule[]>((accumulator, filterRule) => {
        const fieldInRule = fields.find(
            (field) => getItemId(field) === filterRule.target.fieldId,
        );

        if (!fieldInRule) {
            return [...accumulator, filterRule];
        }

        return accumulator;
    }, []);

const FiltersForm: FC<Props> = memo(({ filterTree, isEditMode }) => {
    const dispatch = useExplorerDispatch();
    const { itemsMap, baseTable } = useFiltersContext<FieldsWithSuggestions>();
    const [isOpen, toggleFieldInput] = useToggle(false);
    const fields = useMemo<FieldWithSuggestions[]>(() => {
        return Object.values(itemsMap);
    }, [itemsMap]);

    // Get all filter rules from tree (O(n) scan but only rule nodes)
    const allFilterRules = useMemo(() => {
        return Object.values(filterTree.byId)
            .filter(
                (node): node is Extract<typeof node, { type: 'rule' }> =>
                    node.type === 'rule',
            )
            .map((node) => node.rule);
    }, [filterTree]);

    const invalidFilterRules = getInvalidFilterRules(fields, allFilterRules);
    const hasInvalidFilterRules = invalidFilterRules.length > 0;

    // Check if we should show simplified form (< 2 rules and no nested groups)
    const showSimplifiedForm: boolean = useMemo(() => {
        if (allFilterRules.length >= 2) return false;

        // Check for nested groups (any group node that's not the root)
        const hasNested = Object.values(filterTree.byId).some(
            (node) => node.type === 'group' && node.id !== filterTree.rootId,
        );
        return !hasNested;
    }, [allFilterRules.length, filterTree]);

    const handleaddFilterRuleFromFieldSelect = useCallback(
        (field: FieldWithSuggestions | undefined) => {
            if (field && isFilterableField(field)) {
                dispatch(explorerActions.addFilterRuleFromField({ field }));
                toggleFieldInput(false);
            }
        },
        [dispatch, toggleFieldInput],
    );

    const clearAllFilters = useCallback(() => {
        dispatch(explorerActions.resetFilterTree());
    }, [dispatch]);

    return (
        <Stack spacing="xs" pos="relative" m="sm" style={{ flexGrow: 1 }}>
            {allFilterRules.length >= 1 &&
                (showSimplifiedForm ? (
                    <SimplifiedFilterGroupForm
                        fields={fields}
                        itemsMap={itemsMap}
                        isEditMode={isEditMode}
                        filterRules={allFilterRules}
                    />
                ) : (
                    <>
                        <Divider
                            orientation="vertical"
                            pos="absolute"
                            h="100%"
                            top={0}
                            left={18}
                            style={{ zIndex: 1 }}
                        />

                        <FilterGroupForm
                            groupId={filterTree.rootId}
                            hideLine
                            hideButtons
                            filterTree={filterTree}
                            fields={fields}
                            itemsMap={itemsMap}
                            isEditMode={isEditMode}
                            onDelete={clearAllFilters}
                        />
                    </>
                ))}

            {hasInvalidFilterRules &&
                invalidFilterRules.map((rule, index) => (
                    <Stack
                        key={index}
                        ml={showSimplifiedForm ? 'none' : 'xl'}
                        spacing="two"
                        align="flex-start"
                    >
                        <Group
                            key={rule.id}
                            spacing="xs"
                            pl="xs"
                            sx={(theme) => ({
                                border: `1px solid ${theme.colors.gray[2]}`,
                                borderRadius: theme.radius.sm,
                            })}
                        >
                            <MantineIcon icon={IconAlertCircle} />
                            <Text color="dimmed" fz="xs">
                                Tried to reference field with unknown id:{' '}
                                <Text span fw={500} c="gray.7">
                                    {rule.target.fieldId}
                                </Text>
                            </Text>
                            <ActionIcon
                                onClick={() =>
                                    dispatch(
                                        explorerActions.removeFilterRuleFromTree(
                                            {
                                                ruleId: rule.id,
                                            },
                                        ),
                                    )
                                }
                            >
                                <MantineIcon icon={IconX} size="sm" />
                            </ActionIcon>
                        </Group>
                    </Stack>
                ))}

            {isEditMode && (
                <Box bg="white" pos="relative" style={{ zIndex: 2 }}>
                    {!isOpen ? (
                        <Group align="center" position="apart" sx={{ flex: 1 }}>
                            <Button
                                variant="outline"
                                size="xs"
                                leftIcon={<MantineIcon icon={IconPlus} />}
                                disabled={fields.length <= 0}
                                onClick={toggleFieldInput}
                                data-testid="FiltersForm/add-filter-button"
                            >
                                Add filter
                            </Button>
                            {allFilterRules.length > 0 && (
                                <Tooltip
                                    label="Clear all filters"
                                    position="bottom"
                                >
                                    <Button
                                        variant="light"
                                        size="xs"
                                        color="gray"
                                        onClick={clearAllFilters}
                                        disabled={allFilterRules.length === 0}
                                    >
                                        Clear all
                                    </Button>
                                </Tooltip>
                            )}
                        </Group>
                    ) : (
                        <FieldSelect
                            limit={FILTER_SELECT_LIMIT}
                            size="xs"
                            withinPortal
                            maw={300}
                            autoFocus
                            hasGrouping
                            baseTable={baseTable}
                            items={fields}
                            onChange={handleaddFilterRuleFromFieldSelect}
                            onClosed={toggleFieldInput}
                            rightSection={
                                <ActionIcon onClick={toggleFieldInput}>
                                    <MantineIcon icon={IconX} />
                                </ActionIcon>
                            }
                        />
                    )}
                </Box>
            )}
        </Stack>
    );
});

FiltersForm.displayName = 'FiltersForm';

export default FiltersForm;
