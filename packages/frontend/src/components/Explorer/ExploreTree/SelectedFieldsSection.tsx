import {
    getItemId,
    isAdditionalMetric,
    isCompiledMetric,
    isCustomDimension,
    isDimension,
    isField,
    isFilterableField,
    isMetric,
    MetricType,
    type Dimension,
    type FilterableField,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    HoverCard,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconFilter, IconTrash } from '@tabler/icons-react';
import {
    Fragment,
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { useToggle } from 'react-use';
import {
    explorerActions,
    selectIsFieldFiltered,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
    type ExplorerStoreState,
} from '../../../features/explorer/store';
import { useExplore } from '../../../hooks/useExplore';
import { useAddFilter } from '../../../hooks/useFilters';
import {
    useIsModalHosted,
    useModalHostedDashboardMetricIds,
} from '../../../providers/Explorer/useIsModalHosted';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import FieldIcon from '../../common/Filters/FieldIcon';
import MantineIcon from '../../common/MantineIcon';
import classes from './SelectedFieldsSection.module.css';
import { ItemDetailPreview } from './TableTree/ItemDetailPreview';
import TreeSingleNodeActions from './TableTree/Tree/TreeSingleNodeActions';
import { type NodeItem } from './TableTree/Tree/types';
import { useCustomMetricDelete } from './useCustomMetricDelete';

export type SelectedField = {
    fieldId: string;
    /** Distinguishes the same field selected in both merge sources. */
    selectionKey?: string;
    item: NodeItem;
    tableLabel: string | null;
    isDimension: boolean;
    onDeselect?: (fieldId: string, isDimension: boolean) => void;
    /** Hides every secondary action for contexts that only support deselect. */
    hideActions?: boolean;
    /** Routes filter creation to the field's owning query. */
    onAddFilter?: (field: FilterableField) => void;
    isFiltered?: boolean;
    /** Limits the overflow menu to filter and description actions. */
    basicActionsOnly?: boolean;
};

type RenderedRow = SelectedField & { isExiting: boolean };

const EXIT_ANIMATION_MS = 180;

const getFieldKind = (item: NodeItem): 'dimension' | 'metric' | 'default' => {
    if (isCustomDimension(item) || isDimension(item)) return 'dimension';
    if (isAdditionalMetric(item) || isMetric(item)) return 'metric';
    return 'default';
};

const getFieldLabel = (item: NodeItem): string =>
    isField(item) || isAdditionalMetric(item)
        ? item.label || item.name
        : item.name;

const renderAggregatedSql = (sql: string, type: MetricType): string => {
    switch (type) {
        case MetricType.AVERAGE:
            return `AVG(${sql})`;
        case MetricType.COUNT:
            return `COUNT(${sql})`;
        case MetricType.COUNT_DISTINCT:
            return `COUNT(DISTINCT ${sql})`;
        case MetricType.MAX:
            return `MAX(${sql})`;
        case MetricType.MIN:
            return `MIN(${sql})`;
        case MetricType.SUM:
            return `SUM(${sql})`;
        default:
            return sql;
    }
};

type RowProps = {
    row: RenderedRow;
    onDeselect: (fieldId: string, isDimension: boolean) => void;
};

const SelectedFieldRow: FC<RowProps> = memo(({ row, onDeselect }) => {
    const {
        fieldId,
        selectionKey,
        item,
        isDimension: isDim,
        isExiting,
        hideActions,
        onDeselect: fieldOnDeselect,
        onAddFilter: fieldOnAddFilter,
        isFiltered: isFilteredOverride,
        basicActionsOnly,
    } = row;

    const dispatch = useExplorerDispatch();
    const addFilter = useAddFilter();
    const { track } = useTracking();
    const activeTableName = useExplorerSelector(selectTableName);
    const { data: exploreData } = useExplore(activeTableName);

    const [isHover, toggleHover] = useToggle(false);
    const [isMenuOpen, toggleMenu] = useToggle(false);

    // Registry metrics stay frozen here too; the badge marks provenance
    const dashboardMetricIds = useModalHostedDashboardMetricIds();
    const isModalHosted = useIsModalHosted();
    const isRegistryMetric =
        isAdditionalMetric(item) &&
        (dashboardMetricIds?.has(getItemId(item)) ?? false);
    const isDashboardMetric =
        isRegistryMetric || (isModalHosted && isAdditionalMetric(item));

    const selectIsFiltered = useMemo(
        () => (state: ExplorerStoreState) =>
            selectIsFieldFiltered(state, fieldId),
        [fieldId],
    );
    const isFieldFiltered = useExplorerSelector(
        selectIsFiltered,
        (a, b) => a === b,
    );

    const isFiltered = isFilteredOverride ?? (isField(item) && isFieldFiltered);
    const showFilterAction =
        !hideActions &&
        (isFiltered || isHover) &&
        !isAdditionalMetric(item) &&
        isFilterableField(item);
    const { showDeleteAction: canShowDeleteAction, handleDeleteClick } =
        useCustomMetricDelete({
            item,
            fieldId,
            isHover: isHover && !isRegistryMetric,
        });
    const showDeleteAction = !hideActions && canShowDeleteAction;

    const description =
        isField(item) || isAdditionalMetric(item)
            ? item.description
            : undefined;

    const metricInfo = useMemo(() => {
        if (isCompiledMetric(item)) {
            return {
                type: item.type,
                sql: item.sql,
                compiledSql: item.compiledSql,
                filters: item.filters,
                table: item.table,
                name: item.name,
            };
        }
        if (isAdditionalMetric(item)) {
            const baseDimensionCandidate =
                item.baseDimensionName && exploreData
                    ? exploreData.tables[item.table]?.dimensions[
                          item.baseDimensionName
                      ]
                    : undefined;
            const baseDimension: Dimension | undefined =
                baseDimensionCandidate && isDimension(baseDimensionCandidate)
                    ? baseDimensionCandidate
                    : undefined;
            const baseSql = item.sql ?? '';
            return {
                type: item.type,
                sql: baseSql,
                compiledSql: renderAggregatedSql(baseSql, item.type),
                filters: item.filters,
                table: item.table,
                name: item.name,
                baseDimension,
            };
        }
        return undefined;
    }, [item, exploreData]);

    const isHoverCardDisabled = !description && !metricInfo;

    const label = getFieldLabel(item);

    const handleClick = useCallback(() => {
        if (!isExiting) (fieldOnDeselect ?? onDeselect)(fieldId, isDim);
    }, [isExiting, fieldOnDeselect, onDeselect, fieldId, isDim]);

    const handleMouseEnter = useCallback(
        () => toggleHover(true),
        [toggleHover],
    );
    const handleMouseLeave = useCallback(
        () => toggleHover(false),
        [toggleHover],
    );
    const handleDropdownClick = useCallback(
        (e: React.MouseEvent) => e.stopPropagation(),
        [],
    );

    const handleFilterClick = useCallback(
        (e: React.MouseEvent<HTMLButtonElement>) => {
            track({ name: EventName.ADD_FILTER_CLICKED });
            if (!isFiltered) {
                if (fieldOnAddFilter) {
                    fieldOnAddFilter(item as FilterableField);
                } else {
                    addFilter(item as FilterableField, undefined);
                }
            }
            e.stopPropagation();
        },
        [isFiltered, fieldOnAddFilter, addFilter, item, track],
    );

    const onOpenDescriptionView = useCallback(() => {
        toggleHover(false);
        dispatch(
            explorerActions.openItemDetail({
                itemType: 'field',
                label,
                description,
                fieldItem: item,
            }),
        );
    }, [toggleHover, dispatch, item, label, description]);

    const onToggleMenu = useCallback(() => {
        toggleHover(false);
        toggleMenu();
    }, [toggleHover, toggleMenu]);

    return (
        <UnstyledButton
            component="div"
            className={
                isExiting ? `${classes.row} ${classes.rowExiting}` : classes.row
            }
            data-field-kind={getFieldKind(item)}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            data-testid={`selected-field-${selectionKey ?? fieldId}`}
        >
            <FieldIcon item={item} size="md" />
            <HoverCard
                openDelay={300}
                keepMounted={false}
                withArrow
                disabled={isHoverCardDisabled}
                position="right"
                offset={70}
            >
                <HoverCard.Target>
                    <span className={classes.label} title={label}>
                        {label}
                    </span>
                </HoverCard.Target>
                <HoverCard.Dropdown
                    hidden={!isHover}
                    p="xs"
                    miw={400}
                    mah={500}
                    maw={500}
                    onClick={handleDropdownClick}
                >
                    <ItemDetailPreview
                        onViewDescription={onOpenDescriptionView}
                        description={description}
                        metricInfo={metricInfo}
                    />
                </HoverCard.Dropdown>
            </HoverCard>
            {isDashboardMetric && (
                <Tooltip label="Only available in this dashboard">
                    <Badge size="xs" radius="sm" px={4} className="ld-shrink-0">
                        =
                    </Badge>
                </Tooltip>
            )}
            <span className={classes.actions}>
                {showFilterAction && (
                    <Tooltip
                        label={
                            isFiltered
                                ? 'This field is filtered'
                                : 'Click here to add filter'
                        }
                    >
                        <ActionIcon
                            aria-label={
                                isFiltered ? 'Field is filtered' : 'Add filter'
                            }
                            onClick={handleFilterClick}
                        >
                            <MantineIcon icon={IconFilter} />
                        </ActionIcon>
                    </Tooltip>
                )}
                {showDeleteAction && (
                    <Tooltip label="Delete custom metric">
                        <ActionIcon onClick={handleDeleteClick}>
                            <MantineIcon icon={IconTrash} />
                        </ActionIcon>
                    </Tooltip>
                )}
                {/* Mounted on hover only so the labels get the space at rest */}
                {!hideActions &&
                    (!basicActionsOnly ||
                        isRegistryMetric ||
                        !!description ||
                        (!isAdditionalMetric(item) &&
                            isFilterableField(item))) &&
                    (isHover || isMenuOpen) && (
                        <TreeSingleNodeActions
                            item={item}
                            isHovered={isHover}
                            isSelected={false}
                            isOpened={isMenuOpen}
                            hasDescription={!!description}
                            onViewDescription={onOpenDescriptionView}
                            onMenuChange={onToggleMenu}
                            onAddFilter={fieldOnAddFilter}
                            basicActionsOnly={
                                basicActionsOnly || isRegistryMetric
                            }
                            allowRegistryEdit={isRegistryMetric}
                        />
                    )}
            </span>
        </UnstyledButton>
    );
});

SelectedFieldRow.displayName = 'SelectedFieldRow';

type Props = {
    fields: SelectedField[];
    onDeselect: (fieldId: string, isDimension: boolean) => void;
    heading?: string;
    showAllFieldsDivider?: boolean;
};

type ExitingField = { field: SelectedField; index: number };

/**
 * Pinned "Selected" section shown above the field tree. Deselected rows are
 * kept mounted briefly (in exitingFields) so they can animate out instead of
 * snapping away; the rendered list is derived from props + exitingFields.
 */
const SelectedFieldsSectionComponent: FC<Props> = ({
    fields,
    onDeselect,
    heading = 'Selected',
    showAllFieldsDivider = true,
}) => {
    const [exitingFields, setExitingFields] = useState<
        Map<string, ExitingField>
    >(new Map());
    const prevFieldsRef = useRef<SelectedField[]>(fields);
    const exitTimeouts = useRef(new Map<string, number>());

    // Single external-system sync: manage exit timers when the selection changes
    useEffect(() => {
        const keyFor = (field: SelectedField) =>
            field.selectionKey ?? field.fieldId;
        const currentIds = new Set(fields.map(keyFor));
        const prevFields = prevFieldsRef.current;
        prevFieldsRef.current = fields;

        // Cancel pending removals for fields that were re-selected mid-exit
        exitTimeouts.current.forEach((timeout, fieldKey) => {
            if (currentIds.has(fieldKey)) {
                window.clearTimeout(timeout);
                exitTimeouts.current.delete(fieldKey);
            }
        });

        const removed = prevFields.filter(
            (field) =>
                !currentIds.has(keyFor(field)) &&
                !exitTimeouts.current.has(keyFor(field)),
        );

        setExitingFields((prev) => {
            let changed = false;
            const next = new Map(prev);
            prev.forEach((_, fieldKey) => {
                if (currentIds.has(fieldKey)) {
                    next.delete(fieldKey);
                    changed = true;
                }
            });
            removed.forEach((field) => {
                next.set(keyFor(field), {
                    field,
                    index: prevFields.indexOf(field),
                });
                changed = true;
            });
            return changed ? next : prev;
        });

        removed.forEach((field) => {
            const fieldKey = keyFor(field);
            const timeout = window.setTimeout(() => {
                exitTimeouts.current.delete(fieldKey);
                setExitingFields((prev) => {
                    if (!prev.has(fieldKey)) return prev;
                    const next = new Map(prev);
                    next.delete(fieldKey);
                    return next;
                });
            }, EXIT_ANIMATION_MS);
            exitTimeouts.current.set(fieldKey, timeout);
        });
    }, [fields]);

    useEffect(() => {
        const timeouts = exitTimeouts.current;
        return () => {
            timeouts.forEach((timeout) => window.clearTimeout(timeout));
        };
    }, []);

    const rows: RenderedRow[] = useMemo(() => {
        const keyFor = (field: SelectedField) =>
            field.selectionKey ?? field.fieldId;
        const currentIds = new Set(fields.map(keyFor));
        const result: RenderedRow[] = fields.map((field) => ({
            ...field,
            isExiting: false,
        }));
        // Splice exiting rows back in at their previous position
        [...exitingFields.values()]
            .filter(({ field }) => !currentIds.has(keyFor(field)))
            .sort((a, b) => a.index - b.index)
            .forEach(({ field, index }) => {
                result.splice(Math.min(index, result.length), 0, {
                    ...field,
                    isExiting: true,
                });
            });
        return result;
    }, [fields, exitingFields]);

    // Group rows by table, groups ordered by first appearance
    const groups = useMemo(() => {
        const result: { tableLabel: string | null; rows: RenderedRow[] }[] = [];
        const byLabel = new Map<string | null, RenderedRow[]>();
        rows.forEach((row) => {
            const groupRows = byLabel.get(row.tableLabel);
            if (groupRows) {
                groupRows.push(row);
            } else {
                const newGroupRows = [row];
                byLabel.set(row.tableLabel, newGroupRows);
                result.push({
                    tableLabel: row.tableLabel,
                    rows: newGroupRows,
                });
            }
        });
        return result;
    }, [rows]);

    if (rows.length === 0) return null;

    return (
        <div className={classes.section}>
            <div className={classes.divider}>{heading}</div>
            <div className={classes.list} data-testid="SelectedFieldsSection">
                {groups.map((group) => (
                    <Fragment key={group.tableLabel ?? '__no_table__'}>
                        {group.tableLabel && (
                            <div className={classes.groupHeader}>
                                {group.tableLabel}
                            </div>
                        )}
                        {group.rows.map((row) => (
                            <SelectedFieldRow
                                key={row.selectionKey ?? row.fieldId}
                                row={row}
                                onDeselect={onDeselect}
                            />
                        ))}
                    </Fragment>
                ))}
            </div>
            {showAllFieldsDivider && (
                <div className={classes.divider}>All fields</div>
            )}
        </div>
    );
};

const SelectedFieldsSection = memo(SelectedFieldsSectionComponent);
SelectedFieldsSection.displayName = 'SelectedFieldsSection';

export default SelectedFieldsSection;
