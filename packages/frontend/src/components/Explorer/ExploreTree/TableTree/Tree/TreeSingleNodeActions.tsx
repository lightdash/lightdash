import {
    DimensionType,
    FeatureFlags,
    friendlyName,
    getCustomDimensionWriteBackError,
    getCustomMetricType,
    getItemId,
    isAdditionalMetric,
    isAggregateMetricType,
    isCustomDimension,
    isCustomSqlDimension,
    isDimension,
    isFilterableField,
    isMetric,
    type MetricType,
    type AdditionalMetric,
    type CustomDimension,
    type Dimension,
    type FilterableField,
    type Metric,
} from '@lightdash/common';
import { Box, Menu, type MenuProps, ActionIcon, Tooltip } from '@mantine/core';
import {
    IconCode,
    IconCopy,
    IconDots,
    IconEdit,
    IconFilter,
    IconSparkles,
    IconTrash,
} from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import {
    explorerActions,
    selectSavedChart,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../../../features/explorer/store';
import useToaster from '../../../../../hooks/toaster/useToaster';
import { useFilteredFields } from '../../../../../hooks/useFilters';
import { useProjectUuid } from '../../../../../hooks/useProjectUuid';
import { useCannotAuthorCustomSql } from '../../../../../hooks/user/useCannotAuthorCustomSql';
import { useServerFeatureFlag } from '../../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../../providers/App/useApp';
import { useRequestRegistryMetricDelete } from '../../../../../providers/Explorer/useIsModalHosted';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import MantineIcon from '../../../../common/MantineIcon';
import { useCustomMetricSourceId } from '../../CustomMetricSourceContext';

type Props = {
    item: Metric | Dimension | AdditionalMetric | CustomDimension;
    isHovered: boolean;
    isSelected: boolean;
    hasDescription: boolean;
    isOpened: MenuProps['opened'];
    onMenuChange: MenuProps['onChange'];
    onViewDescription: () => void;
    onAddFilter?: (field: FilterableField) => void;
    /** Quick-create a metric from a dimension in place; falls back to the modal */
    onQuickCreateMetric?: (type: MetricType) => void;
    basicActionsOnly?: boolean;
    /** Registry metrics stay basicActionsOnly but keep the edit entry point */
    allowRegistryEdit?: boolean;
};

const TreeSingleNodeActions: FC<Props> = ({
    item,
    isHovered,
    isSelected,
    isOpened,
    onMenuChange,
    hasDescription,
    onViewDescription,
    onAddFilter,
    onQuickCreateMetric,
    basicActionsOnly = false,
    allowRegistryEdit = false,
}) => {
    const projectUuid = useProjectUuid();
    const cannotAuthorCustomSql = useCannotAuthorCustomSql(projectUuid);
    const savedChart = useExplorerSelector(selectSavedChart);
    const { user } = useApp();
    const { showToastSuccess } = useToaster();
    const { addFilter } = useFilteredFields();
    const { track } = useTracking();

    const dispatch = useExplorerDispatch();
    const customMetricSourceId = useCustomMetricSourceId();
    const customDimensionWriteBackError = isCustomDimension(item)
        ? getCustomDimensionWriteBackError(item)
        : null;
    const { t } = useTranslation('explorer');
    const customMetrics = useMemo(() => {
        if (isCustomSqlDimension(item)) {
            return getCustomMetricType(item.dimensionType);
        }
        return isDimension(item) ? getCustomMetricType(item.type) : [];
    }, [item]);

    const requestRegistryMetricDelete = useRequestRegistryMetricDelete();

    const { data: customGroupBinsFlag } = useServerFeatureFlag(
        FeatureFlags.CustomGroupBins,
    );
    const isCustomGroupBinsEnabled = customGroupBinsFlag?.enabled ?? false;

    const duplicateCustomMetric = (customMetric: AdditionalMetric) => {
        const newDeepCopyItem = JSON.parse(JSON.stringify(customMetric));
        let newId = uuidv4();
        let newIdSubstring = newId.replace(/-/g, '').substring(0, 16);
        let currentName = newDeepCopyItem.name;
        const pattern = '_8id9_';
        const patternIndex = currentName.indexOf(pattern);
        if (patternIndex !== -1) {
            currentName =
                currentName.substring(0, patternIndex + pattern.length) +
                newIdSubstring;
        } else {
            currentName = currentName + pattern + newIdSubstring;
        }
        newDeepCopyItem.label = t('exploreTree.actions.copyOf', {
            name: newDeepCopyItem.label,
        });
        newDeepCopyItem.uuid = newId;
        newDeepCopyItem.name = currentName;
        dispatch(explorerActions.addAdditionalMetric(newDeepCopyItem));
    };
    const duplicateCustomDimension = (customDimension: CustomDimension) => {
        const newDeepCopyItem = JSON.parse(JSON.stringify(customDimension));
        let newIdSubstring = uuidv4().replace(/-/g, '').substring(0, 16);
        let currentId = newDeepCopyItem.id;
        const pattern = '_8id9_';
        const patternIndex = currentId.indexOf(pattern);
        if (patternIndex !== -1) {
            currentId =
                currentId.substring(0, patternIndex + pattern.length) +
                newIdSubstring;
        } else {
            currentId = currentId + pattern + newIdSubstring;
        }
        newDeepCopyItem.name = t('exploreTree.actions.copyOf', {
            name: newDeepCopyItem.name,
        });
        newDeepCopyItem.id = currentId;
        dispatch(explorerActions.addCustomDimension(newDeepCopyItem));
    };
    return isHovered || isSelected || isOpened ? (
        <Menu
            withArrow
            position="bottom-end"
            arrowOffset={12}
            offset={-4}
            opened={isOpened}
            onChange={onMenuChange}
        >
            <Menu.Dropdown>
                {!isAdditionalMetric(item) && isFilterableField(item) ? (
                    <Menu.Item
                        component="button"
                        leftSection={<MantineIcon icon={IconFilter} />}
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation();

                            track({
                                name: EventName.ADD_FILTER_CLICKED,
                            });
                            if (onAddFilter) {
                                onAddFilter(item);
                            } else {
                                addFilter(item, undefined);
                            }
                        }}
                    >
                        {t('exploreTree.actions.addFilter')}
                    </Menu.Item>
                ) : null}

                {!basicActionsOnly &&
                isMetric(item) &&
                isAggregateMetricType(item.type) ? (
                    <Menu.Item
                        component="button"
                        leftSection={<MantineIcon icon={IconCopy} />}
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation();
                            track({
                                name: EventName.ADD_CUSTOM_METRIC_CLICKED,
                            });
                            dispatch(
                                explorerActions.toggleAdditionalMetricModal({
                                    type: item.type,
                                    item,
                                    isEditing: false,
                                    mergeSourceId: customMetricSourceId,
                                }),
                            );
                        }}
                    >
                        {t('exploreTree.actions.createCustomMetric')}
                    </Menu.Item>
                ) : null}

                {(!basicActionsOnly || allowRegistryEdit) &&
                isAdditionalMetric(item) ? (
                    <Menu.Item
                        component="button"
                        leftSection={<MantineIcon icon={IconEdit} />}
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation();
                            dispatch(
                                explorerActions.toggleAdditionalMetricModal({
                                    type: item.type,
                                    item,
                                    isEditing: true,
                                }),
                            );
                        }}
                    >
                        {t('exploreTree.actions.editCustomMetric')}
                    </Menu.Item>
                ) : null}

                {allowRegistryEdit && isAdditionalMetric(item) ? (
                    <Menu.Item
                        component="button"
                        color="red"
                        leftSection={<MantineIcon icon={IconTrash} />}
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation();
                            requestRegistryMetricDelete?.(item);
                        }}
                    >
                        {t('exploreTree.actions.deleteCustomMetric')}
                    </Menu.Item>
                ) : null}

                {!basicActionsOnly && isAdditionalMetric(item) ? (
                    <>
                        <Menu.Item
                            component="button"
                            leftSection={<MantineIcon icon={IconCopy} />}
                            onClick={(
                                e: React.MouseEvent<HTMLButtonElement>,
                            ) => {
                                e.stopPropagation();
                                duplicateCustomMetric(item);
                                track({
                                    name: EventName.ADD_CUSTOM_METRIC_CLICKED,
                                });
                                showToastSuccess({
                                    title: t(
                                        'exploreTree.actions.customMetricDuplicated',
                                    ),
                                });
                            }}
                        >
                            {t('exploreTree.actions.duplicateCustomMetric')}
                        </Menu.Item>

                        {/* Write-back requires a base dimension column to attach the metric to in YAML */}
                        {item.baseDimensionName ? (
                            <Menu.Item
                                component="button"
                                leftSection={<MantineIcon icon={IconCode} />}
                                onClick={(
                                    e: React.MouseEvent<HTMLButtonElement>,
                                ) => {
                                    e.stopPropagation();
                                    if (
                                        projectUuid &&
                                        user.data?.organizationUuid
                                    ) {
                                        track({
                                            name: EventName.WRITE_BACK_FROM_CUSTOM_METRIC_CLICKED,
                                            properties: {
                                                userId: user.data.userUuid,
                                                projectId: projectUuid,
                                                organizationId:
                                                    user.data.organizationUuid,
                                                customMetricsCount: 1,
                                            },
                                        });
                                    }
                                    dispatch(
                                        explorerActions.toggleWriteBackModal({
                                            items: [item],
                                        }),
                                    );
                                }}
                            >
                                {t('exploreTree.actions.writeBack')}
                            </Menu.Item>
                        ) : null}

                        <Menu.Item
                            color="red"
                            key="custommetric"
                            component="button"
                            leftSection={<MantineIcon icon={IconTrash} />}
                            onClick={(
                                e: React.MouseEvent<HTMLButtonElement>,
                            ) => {
                                e.stopPropagation();

                                track({
                                    name: EventName.REMOVE_CUSTOM_METRIC_CLICKED,
                                });
                                dispatch(
                                    explorerActions.removeAdditionalMetric(
                                        getItemId(item),
                                    ),
                                );
                            }}
                        >
                            {t('exploreTree.actions.deleteCustomMetric')}
                        </Menu.Item>
                    </>
                ) : null}

                {hasDescription && (
                    <Menu.Item
                        component="button"
                        leftSection={<MantineIcon icon={IconDots} />}
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation();
                            onViewDescription();
                        }}
                    >
                        {t('exploreTree.actions.viewDescription')}
                    </Menu.Item>
                )}

                {!basicActionsOnly && isCustomDimension(item) && (
                    <>
                        {!(
                            isCustomSqlDimension(item) && cannotAuthorCustomSql
                        ) && (
                            <>
                                <Menu.Item
                                    component="button"
                                    leftSection={
                                        <MantineIcon icon={IconEdit} />
                                    }
                                    onClick={(
                                        e: React.MouseEvent<HTMLButtonElement>,
                                    ) => {
                                        e.stopPropagation();
                                        dispatch(
                                            explorerActions.toggleCustomDimensionModal(
                                                {
                                                    item,
                                                    isEditing: true,
                                                },
                                            ),
                                        );
                                    }}
                                >
                                    {t(
                                        'exploreTree.actions.editCustomDimension',
                                    )}
                                </Menu.Item>
                                <Menu.Item
                                    component="button"
                                    leftSection={
                                        <MantineIcon icon={IconCopy} />
                                    }
                                    onClick={(
                                        e: React.MouseEvent<HTMLButtonElement>,
                                    ) => {
                                        e.stopPropagation();
                                        duplicateCustomDimension(item);
                                        track({
                                            name: EventName.ADD_CUSTOM_DIMENSION_CLICKED,
                                        });
                                        showToastSuccess({
                                            title: t(
                                                'exploreTree.actions.customDimensionDuplicated',
                                            ),
                                        });
                                    }}
                                >
                                    {t(
                                        'exploreTree.actions.duplicateCustomDimension',
                                    )}
                                </Menu.Item>
                                {!cannotAuthorCustomSql && (
                                    <Tooltip
                                        label={customDimensionWriteBackError}
                                        disabled={
                                            !customDimensionWriteBackError
                                        }
                                    >
                                        <Box component="span">
                                            <Menu.Item
                                                component="button"
                                                disabled={
                                                    !!customDimensionWriteBackError
                                                }
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconCode}
                                                    />
                                                }
                                                onClick={(
                                                    e: React.MouseEvent<HTMLButtonElement>,
                                                ) => {
                                                    e.stopPropagation();
                                                    if (
                                                        customDimensionWriteBackError
                                                    )
                                                        return;
                                                    if (
                                                        projectUuid &&
                                                        user.data
                                                            ?.organizationUuid
                                                    ) {
                                                        track({
                                                            name: EventName.WRITE_BACK_FROM_CUSTOM_DIMENSION_CLICKED,
                                                            properties: {
                                                                userId: user
                                                                    .data
                                                                    .userUuid,
                                                                projectId:
                                                                    projectUuid,
                                                                organizationId:
                                                                    user.data
                                                                        .organizationUuid,
                                                                customDimensionsCount: 1,
                                                            },
                                                        });
                                                    }

                                                    dispatch(
                                                        explorerActions.toggleWriteBackModal(
                                                            {
                                                                items: [item],
                                                            },
                                                        ),
                                                    );
                                                }}
                                            >
                                                {t(
                                                    'exploreTree.actions.writeBack',
                                                )}
                                            </Menu.Item>
                                        </Box>
                                    </Tooltip>
                                )}
                            </>
                        )}

                        {!(
                            isCustomSqlDimension(item) &&
                            cannotAuthorCustomSql &&
                            !!savedChart
                        ) && (
                            <Menu.Item
                                color="red"
                                component="button"
                                leftSection={<MantineIcon icon={IconTrash} />}
                                onClick={(
                                    e: React.MouseEvent<HTMLButtonElement>,
                                ) => {
                                    e.stopPropagation();
                                    dispatch(
                                        explorerActions.removeCustomDimension(
                                            getItemId(item),
                                        ),
                                    );
                                }}
                            >
                                {t('exploreTree.actions.deleteCustomDimension')}
                            </Menu.Item>
                        )}
                    </>
                )}

                {!basicActionsOnly &&
                customMetrics.length > 0 &&
                (isDimension(item) || isCustomSqlDimension(item)) ? (
                    <>
                        <Menu.Divider />

                        <Menu.Label>
                            {t('exploreTree.actions.addCustomMetrics')}
                        </Menu.Label>
                        {customMetrics.map((metric) => (
                            <Menu.Item
                                key={metric}
                                role="menuitem"
                                component="button"
                                onClick={(
                                    e: React.MouseEvent<HTMLButtonElement>,
                                ) => {
                                    e.stopPropagation();

                                    if (onQuickCreateMetric) {
                                        onQuickCreateMetric(metric);
                                    } else {
                                        dispatch(
                                            explorerActions.toggleAdditionalMetricModal(
                                                {
                                                    type: metric,
                                                    item,
                                                    isEditing: false,
                                                    mergeSourceId:
                                                        customMetricSourceId,
                                                },
                                            ),
                                        );
                                    }

                                    track({
                                        name: EventName.ADD_CUSTOM_METRIC_CLICKED,
                                    });
                                }}
                            >
                                {friendlyName(metric)}
                            </Menu.Item>
                        ))}
                    </>
                ) : null}

                {!basicActionsOnly &&
                isDimension(item) &&
                (item.type === DimensionType.NUMBER ||
                    (item.type === DimensionType.STRING &&
                        isCustomGroupBinsEnabled)) ? (
                    <>
                        <Menu.Divider />
                        <Menu.Item
                            component="button"
                            leftSection={<MantineIcon icon={IconSparkles} />}
                            onClick={(
                                e: React.MouseEvent<HTMLButtonElement>,
                            ) => {
                                e.stopPropagation();

                                track({
                                    name: EventName.ADD_CUSTOM_DIMENSION_CLICKED,
                                });
                                dispatch(
                                    explorerActions.toggleCustomDimensionModal({
                                        item,
                                        isEditing: false,
                                    }),
                                );
                            }}
                        >
                            {t('exploreTree.actions.addCustomDimensions')}
                        </Menu.Item>
                    </>
                ) : null}
            </Menu.Dropdown>

            {/* prevents bubbling of click event to NavLink */}
            <Box
                component="div"
                onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                    e.stopPropagation();
                    e.preventDefault();
                }}
            >
                <Menu.Target>
                    <Tooltip
                        openDelay={500}
                        position="top"
                        label={t('exploreTree.actions.viewOptions')}
                        disabled={isOpened}
                    >
                        <ActionIcon
                            aria-label={t('exploreTree.actions.viewOptions')}
                            variant="transparent"
                        >
                            <MantineIcon
                                icon={IconDots}
                                color={isOpened ? 'black' : undefined}
                            />
                        </ActionIcon>
                    </Tooltip>
                </Menu.Target>
            </Box>
        </Menu>
    ) : (
        <Box w={28} />
    );
};

export default TreeSingleNodeActions;
