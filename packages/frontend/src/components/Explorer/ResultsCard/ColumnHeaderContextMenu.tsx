import {
    DimensionType,
    getItemId,
    getItemLabelWithoutTableName,
    getItemMap,
    isAggregateMetricType,
    isCustomDimension,
    isCustomSqlDimension,
    isDimension,
    isField,
    isFilterableField,
    isMetric,
    isMetricWithDateValue,
    isNumericItem,
    isPeriodOverPeriodAdditionalMetric,
    isTableCalculation,
    isTimeBasedDimension,
    type SortField,
    type TableCalculation,
    type MergeTableCalculation,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Menu, Text } from '@mantine/core';
import {
    IconCopy,
    IconDots,
    IconFilter,
    IconMinus,
    IconPencil,
    IconTimelineEvent,
    IconTrash,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
    explorerActions,
    selectAdditionalMetrics,
    selectSavedChart,
    selectTableCalculations,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import {
    DeleteMergeTableCalculationModal,
    MergeTableCalculationModal,
} from '../../../features/mergeQuery/components/MergeTableCalculationModal';
import { useMergeSafe } from '../../../features/mergeQuery/context/useMerge';
import {
    DeleteTableCalculationModal,
    UpdateTableCalculationModal,
} from '../../../features/tableCalculation';
import { useExplore } from '../../../hooks/useExplore';
import { useFilters } from '../../../hooks/useFilters';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useCannotAuthorCustomSql } from '../../../hooks/user/useCannotAuthorCustomSql';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { SortDirection } from '../../../utils/sortUtils';
import { BetaBadge } from '../../common/BetaBadge';
import MantineIcon from '../../common/MantineIcon';
import { type HeaderProps, type TableColumn } from '../../common/Table/types';
import ColumnHeaderSortMenuOptions from './ColumnHeaderSortMenuOptions';
import FormatMenuOptions from './FormatMenuOptions';
import QuickCalculationMenuOptions from './QuickCalculations';

interface ContextMenuProps extends HeaderProps {
    onToggleCalculationEditModal: (value: boolean) => void;
    onToggleCalculationDeleteModal: (value: boolean) => void;
    onQuickCalculationCreated: (tableCalculation: TableCalculation) => void;
    mergeTableCalculation?: MergeTableCalculation;
}

const ContextMenu: FC<ContextMenuProps> = ({
    header,
    onToggleCalculationEditModal,
    onToggleCalculationDeleteModal,
    onQuickCalculationCreated,
    mergeTableCalculation,
}) => {
    const { t } = useTranslation('explorer');
    const { addFilter } = useFilters();
    const { track } = useTracking();

    const meta = header.column.columnDef.meta;
    const item = meta?.item;
    const sort = meta?.sort?.sort;

    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const tableCalculations = useExplorerSelector(selectTableCalculations);
    const tableName = useExplorerSelector(selectTableName);
    const dispatch = useExplorerDispatch();
    const projectUuid = useProjectUuid();
    const cannotAuthorCustomSql = useCannotAuthorCustomSql(projectUuid);
    const savedChart = useExplorerSelector(selectSavedChart);

    // Get explore data to check if metrics return date values
    const { data: exploreData } = useExplore(tableName, {
        refetchOnMount: false,
    });

    const itemsMap = useMemo(() => {
        if (exploreData) {
            return getItemMap(
                exploreData,
                additionalMetrics,
                tableCalculations,
            );
        }
        return undefined;
    }, [exploreData, additionalMetrics, tableCalculations]);

    const additionalMetric = useMemo(
        () =>
            !!additionalMetrics &&
            !!item &&
            additionalMetrics.find((am) => getItemId(am) === getItemId(item)),
        [additionalMetrics, item],
    );

    const isItemAdditionalMetric = !!additionalMetric;
    const isPopAdditionalMetric =
        isPeriodOverPeriodAdditionalMetric(additionalMetric);

    const sortSelectedDirection = sort
        ? sort.descending
            ? SortDirection.DESC
            : SortDirection.ASC
        : undefined;
    const onSortSelect = (direction: SortDirection) => {
        if (!item) return;
        const newSort: SortField = {
            fieldId: getItemId(item),
            descending: direction === SortDirection.DESC,
        };
        dispatch(explorerActions.setSortFields([newSort]));
    };

    if (item && mergeTableCalculation) {
        return (
            <>
                <Menu.Item
                    leftSection={<MantineIcon icon={IconPencil} />}
                    onClick={() => onToggleCalculationEditModal(true)}
                >
                    {t('columnHeaderMenu.editCalculation')}
                </Menu.Item>
                <Menu.Divider />
                <ColumnHeaderSortMenuOptions
                    item={item}
                    selectedDirection={sortSelectedDirection}
                    onSelect={onSortSelect}
                />
                <Menu.Divider />
                <Menu.Item
                    leftSection={<MantineIcon icon={IconTrash} />}
                    color="red"
                    onClick={() => onToggleCalculationDeleteModal(true)}
                >
                    {t('columnHeaderMenu.remove')}
                </Menu.Item>
            </>
        );
    }

    if (item && isField(item)) {
        const itemFieldId = getItemId(item);
        return (
            <>
                {isMetric(item) && !isPopAdditionalMetric ? (
                    <>
                        <Menu.Item
                            leftSection={
                                <MantineIcon icon={IconTimelineEvent} />
                            }
                            rightSection={
                                <Box ml="sm">
                                    <BetaBadge tooltipLabel="" />
                                </Box>
                            }
                            onClick={() => {
                                dispatch(
                                    explorerActions.togglePeriodOverPeriodComparisonModal(
                                        {
                                            metric: item,
                                            itemsMap: itemsMap,
                                        },
                                    ),
                                );
                            }}
                        >
                            {t('columnHeaderMenu.addPeriodComparison')}
                        </Menu.Item>

                        {!isItemAdditionalMetric &&
                        isAggregateMetricType(item.type) ? (
                            <Menu.Item
                                leftSection={<MantineIcon icon={IconCopy} />}
                                onClick={() => {
                                    track({
                                        name: EventName.ADD_CUSTOM_METRIC_CLICKED,
                                    });
                                    dispatch(
                                        explorerActions.toggleAdditionalMetricModal(
                                            {
                                                type: item.type,
                                                item,
                                                isEditing: false,
                                            },
                                        ),
                                    );
                                }}
                            >
                                {t('columnHeaderMenu.createCustomMetric')}
                            </Menu.Item>
                        ) : null}

                        <Menu.Divider />
                    </>
                ) : null}

                {isFilterableField(item) && !isPopAdditionalMetric && (
                    <>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconFilter} />}
                            onClick={() => {
                                track({ name: EventName.ADD_FILTER_CLICKED });
                                addFilter(item, undefined);
                            }}
                        >
                            <Trans
                                t={t}
                                i18nKey="columnHeaderMenu.filterByQuoted"
                                values={{
                                    label: getItemLabelWithoutTableName(item),
                                }}
                                components={{ label: <Text span /> }}
                            />
                        </Menu.Item>

                        <Menu.Divider />
                    </>
                )}

                {!isPopAdditionalMetric && (
                    <>
                        <ColumnHeaderSortMenuOptions
                            item={item}
                            selectedDirection={sortSelectedDirection}
                            onSelect={onSortSelect}
                        />
                        <Menu.Divider />
                    </>
                )}

                {isTimeBasedDimension(item) ||
                (isDimension(item) && item.type === DimensionType.NUMBER) ? (
                    <>
                        <FormatMenuOptions item={item} />
                        <Menu.Divider />
                    </>
                ) : null}

                {isMetric(item) && !isPopAdditionalMetric && (
                    <>
                        {!isItemAdditionalMetric &&
                            (isNumericItem(item) ||
                                isMetricWithDateValue(item, itemsMap)) && (
                                <>
                                    <FormatMenuOptions item={item} />
                                    <Menu.Divider />
                                </>
                            )}

                        <QuickCalculationMenuOptions
                            item={item}
                            onCalculationCreated={onQuickCalculationCreated}
                        />
                        <Menu.Divider />
                    </>
                )}

                {isItemAdditionalMetric && !isPopAdditionalMetric ? (
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconPencil} />}
                        onClick={() => {
                            dispatch(
                                explorerActions.toggleAdditionalMetricModal({
                                    item: additionalMetric,
                                    type: additionalMetric.type,
                                    isEditing: true,
                                }),
                            );
                        }}
                    >
                        {t('columnHeaderMenu.editCustomMetric')}
                    </Menu.Item>
                ) : null}

                {isItemAdditionalMetric && !isPopAdditionalMetric ? (
                    <>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconMinus} />}
                            onClick={() => {
                                dispatch(
                                    explorerActions.toggleMetric(itemFieldId),
                                );
                            }}
                        >
                            {t('columnHeaderMenu.remove')}
                        </Menu.Item>

                        <Menu.Item
                            leftSection={<MantineIcon icon={IconTrash} />}
                            color="red"
                            onClick={() => {
                                dispatch(
                                    explorerActions.removeAdditionalMetric(
                                        itemFieldId,
                                    ),
                                );
                            }}
                        >
                            {t('columnHeaderMenu.deleteCustomMetric')}
                        </Menu.Item>
                    </>
                ) : (
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconTrash} />}
                        color="red"
                        onClick={() => {
                            dispatch(explorerActions.removeField(itemFieldId));
                        }}
                    >
                        {t('columnHeaderMenu.remove')}
                    </Menu.Item>
                )}
            </>
        );
    } else if (meta?.isInvalidItem) {
        return (
            <>
                <Menu.Item
                    leftSection={<MantineIcon icon={IconTrash} />}
                    color="red"
                    onClick={() => {
                        dispatch(explorerActions.removeField(header.column.id));
                    }}
                >
                    {t('columnHeaderMenu.remove')}
                </Menu.Item>
            </>
        );
    } else if (item && isCustomDimension(item)) {
        const hideSqlAuthoringActions =
            isCustomSqlDimension(item) && cannotAuthorCustomSql;
        const hideRemove = hideSqlAuthoringActions && !!savedChart;
        return (
            <>
                {isFilterableField(item) && (
                    <>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconFilter} />}
                            onClick={() => {
                                track({ name: EventName.ADD_FILTER_CLICKED });
                                addFilter(item, undefined);
                            }}
                        >
                            <Trans
                                t={t}
                                i18nKey="columnHeaderMenu.filterBy"
                                values={{
                                    label: getItemLabelWithoutTableName(item),
                                }}
                                components={{ label: <Text span fw={500} /> }}
                            />
                        </Menu.Item>

                        <Menu.Divider />
                    </>
                )}

                {!hideSqlAuthoringActions && (
                    <>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconPencil} />}
                            onClick={() => {
                                dispatch(
                                    explorerActions.toggleCustomDimensionModal({
                                        item,
                                        isEditing: true,
                                    }),
                                );
                            }}
                        >
                            {t('columnHeaderMenu.editCustomDimension')}
                        </Menu.Item>
                        <Menu.Divider />
                    </>
                )}

                <ColumnHeaderSortMenuOptions
                    item={item}
                    selectedDirection={sortSelectedDirection}
                    onSelect={onSortSelect}
                />

                {!hideRemove && (
                    <>
                        <Menu.Divider />

                        <Menu.Item
                            leftSection={<MantineIcon icon={IconMinus} />}
                            onClick={() => {
                                dispatch(
                                    explorerActions.toggleDimension(
                                        getItemId(item),
                                    ),
                                );
                            }}
                        >
                            {t('columnHeaderMenu.remove')}
                        </Menu.Item>

                        <Menu.Item
                            leftSection={<MantineIcon icon={IconTrash} />}
                            color="red"
                            onClick={() => {
                                dispatch(
                                    explorerActions.removeCustomDimension(
                                        getItemId(item),
                                    ),
                                );
                            }}
                        >
                            {t('columnHeaderMenu.deleteCustomDimension')}
                        </Menu.Item>
                    </>
                )}
            </>
        );
    } else if (item && isTableCalculation(item)) {
        return (
            <>
                <Menu.Item
                    leftSection={<MantineIcon icon={IconFilter} />}
                    onClick={() => {
                        track({ name: EventName.ADD_FILTER_CLICKED });
                        addFilter(item, undefined);
                    }}
                >
                    <Trans
                        t={t}
                        i18nKey="columnHeaderMenu.filterBy"
                        values={{ label: getItemLabelWithoutTableName(item) }}
                        components={{ label: <Text span fw="semibold" /> }}
                    />
                </Menu.Item>

                <Menu.Divider />

                <Menu.Item
                    leftSection={<MantineIcon icon={IconPencil} />}
                    onClick={() => {
                        track({
                            name: EventName.EDIT_TABLE_CALCULATION_BUTTON_CLICKED,
                        });

                        onToggleCalculationEditModal(true);
                    }}
                >
                    {t('columnHeaderMenu.editCalculation')}
                </Menu.Item>

                <Menu.Divider />

                <ColumnHeaderSortMenuOptions
                    item={item}
                    selectedDirection={sortSelectedDirection}
                    onSelect={onSortSelect}
                />

                <Menu.Divider />

                <Menu.Item
                    leftSection={<MantineIcon icon={IconTrash} />}
                    color="red"
                    onClick={() => {
                        track({
                            name: EventName.DELETE_TABLE_CALCULATION_BUTTON_CLICKED,
                        });

                        onToggleCalculationDeleteModal(true);
                    }}
                >
                    {t('columnHeaderMenu.remove')}
                </Menu.Item>
            </>
        );
    } else {
        return null;
    }
};

const ColumnHeaderContextMenu: FC<HeaderProps> = ({ header }) => {
    const { t } = useTranslation('explorer');
    const [showUpdate, setShowUpdate] = useState(false);
    const [showDelete, setShowDelete] = useState(false);
    const [quickCalcToEdit, setQuickCalcToEdit] =
        useState<TableCalculation | null>(null);

    const meta = header.column.columnDef.meta as TableColumn['meta'];
    const item = meta?.item;
    const merge = useMergeSafe();
    const mergeTableCalculation = useMemo(() => {
        if (!item || !merge?.mergeResults) return undefined;
        const origin = merge.mergeResults.fieldOrigins[getItemId(item)];
        if (origin?.kind !== 'tableCalculation') return undefined;
        return merge.tableCalculations.find(
            (calculation) => calculation.name === item.name,
        );
    }, [item, merge]);

    if (meta && (meta.item || meta.isInvalidItem === true)) {
        return (
            <div
                onClick={(e) => {
                    e.stopPropagation();
                }}
            >
                <Group gap="two" wrap="nowrap">
                    <Menu withArrow>
                        <Menu.Target>
                            <ActionIcon
                                size="xs"
                                variant="light"
                                bg="transparent"
                                aria-label={t('columnHeaderMenu.contextMenu')}
                            >
                                <MantineIcon icon={IconDots} />
                            </ActionIcon>
                        </Menu.Target>

                        <Menu.Dropdown>
                            <ContextMenu
                                header={header}
                                onToggleCalculationEditModal={setShowUpdate}
                                onToggleCalculationDeleteModal={setShowDelete}
                                onQuickCalculationCreated={setQuickCalcToEdit}
                                mergeTableCalculation={mergeTableCalculation}
                            />
                        </Menu.Dropdown>
                    </Menu>
                </Group>

                {showUpdate &&
                    (mergeTableCalculation ? (
                        <MergeTableCalculationModal
                            opened
                            tableCalculation={mergeTableCalculation}
                            onClose={() => setShowUpdate(false)}
                        />
                    ) : (
                        <UpdateTableCalculationModal
                            opened
                            tableCalculation={item as TableCalculation}
                            onClose={() => setShowUpdate(false)}
                        />
                    ))}

                {showDelete &&
                    (mergeTableCalculation ? (
                        <DeleteMergeTableCalculationModal
                            tableCalculation={mergeTableCalculation}
                            onClose={() => setShowDelete(false)}
                        />
                    ) : (
                        <DeleteTableCalculationModal
                            tableCalculation={item as TableCalculation}
                            onClose={() => setShowDelete(false)}
                        />
                    ))}

                {quickCalcToEdit && (
                    <UpdateTableCalculationModal
                        opened
                        tableCalculation={quickCalcToEdit}
                        onClose={() => setQuickCalcToEdit(null)}
                    />
                )}
            </div>
        );
    } else {
        return null;
    }
};

export default ColumnHeaderContextMenu;
