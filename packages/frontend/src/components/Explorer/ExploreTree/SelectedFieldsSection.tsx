import {
    isAdditionalMetric,
    isCustomDimension,
    isDimension,
    isField,
    isFilterableField,
    isMetric,
    type FilterableField,
} from '@lightdash/common';
import { ActionIcon, Tooltip } from '@mantine/core';
import { UnstyledButton } from '@mantine-8/core';
import { IconFilter } from '@tabler/icons-react';
import {
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
    useExplorerDispatch,
    useExplorerSelector,
    type ExplorerStoreState,
} from '../../../features/explorer/store';
import { useAddFilter } from '../../../hooks/useFilters';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import FieldIcon from '../../common/Filters/FieldIcon';
import MantineIcon from '../../common/MantineIcon';
import classes from './SelectedFieldsSection.module.css';
import TreeSingleNodeActions from './TableTree/Tree/TreeSingleNodeActions';
import { type NodeItem } from './TableTree/Tree/types';

export type SelectedField = {
    fieldId: string;
    item: NodeItem;
    tableLabel: string | null;
    isDimension: boolean;
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

type RowProps = {
    row: RenderedRow;
    onDeselect: (fieldId: string, isDimension: boolean) => void;
};

const SelectedFieldRow: FC<RowProps> = memo(({ row, onDeselect }) => {
    const { fieldId, item, tableLabel, isDimension: isDim, isExiting } = row;

    const dispatch = useExplorerDispatch();
    const addFilter = useAddFilter();
    const { track } = useTracking();

    const [isHover, toggleHover] = useToggle(false);
    const [isMenuOpen, toggleMenu] = useToggle(false);

    const selectIsFiltered = useMemo(
        () => (state: ExplorerStoreState) =>
            selectIsFieldFiltered(state, fieldId),
        [fieldId],
    );
    const isFieldFiltered = useExplorerSelector(
        selectIsFiltered,
        (a, b) => a === b,
    );

    const isFiltered = isField(item) && isFieldFiltered;
    const showFilterAction =
        (isFiltered || isHover) &&
        !isAdditionalMetric(item) &&
        isFilterableField(item);

    const description =
        isField(item) || isAdditionalMetric(item)
            ? item.description
            : undefined;

    const label = getFieldLabel(item);

    const handleClick = useCallback(() => {
        if (!isExiting) onDeselect(fieldId, isDim);
    }, [isExiting, onDeselect, fieldId, isDim]);

    const handleMouseEnter = useCallback(
        () => toggleHover(true),
        [toggleHover],
    );
    const handleMouseLeave = useCallback(
        () => toggleHover(false),
        [toggleHover],
    );

    const handleFilterClick = useCallback(
        (e: React.MouseEvent<HTMLButtonElement>) => {
            track({ name: EventName.ADD_FILTER_CLICKED });
            if (!isFiltered) addFilter(item as FilterableField, undefined);
            e.stopPropagation();
        },
        [isFiltered, addFilter, item, track],
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
                isExiting
                    ? `${classes.row} ${classes.rowExiting}`
                    : classes.row
            }
            data-field-kind={getFieldKind(item)}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            data-testid={`selected-field-${fieldId}`}
        >
            <FieldIcon item={item} size="md" />
            <span className={classes.labels}>
                <span className={classes.label} title={label}>
                    {label}
                </span>
                {tableLabel && (
                    <span className={classes.tableLabel}>{tableLabel}</span>
                )}
            </span>
            <span className={classes.actions}>
                {showFilterAction && (
                    <Tooltip
                        withinPortal
                        label={
                            isFiltered
                                ? 'This field is filtered'
                                : 'Click here to add filter'
                        }
                    >
                        <ActionIcon onClick={handleFilterClick}>
                            <MantineIcon icon={IconFilter} />
                        </ActionIcon>
                    </Tooltip>
                )}
                <TreeSingleNodeActions
                    item={item}
                    isHovered={isHover}
                    isSelected
                    isOpened={isMenuOpen}
                    hasDescription={!!description}
                    onViewDescription={onOpenDescriptionView}
                    onMenuChange={onToggleMenu}
                />
            </span>
        </UnstyledButton>
    );
});

SelectedFieldRow.displayName = 'SelectedFieldRow';

type Props = {
    fields: SelectedField[];
    onDeselect: (fieldId: string, isDimension: boolean) => void;
};

/**
 * Pinned "Selected" section shown above the field tree. Deselected rows are
 * kept mounted briefly so they can animate out instead of snapping away.
 */
const SelectedFieldsSectionComponent: FC<Props> = ({ fields, onDeselect }) => {
    const [rows, setRows] = useState<RenderedRow[]>(() =>
        fields.map((field) => ({ ...field, isExiting: false })),
    );
    const exitTimeouts = useRef(new Map<string, number>());

    useEffect(() => {
        const currentIds = new Set(fields.map((field) => field.fieldId));

        // Cancel pending removals for fields that were re-selected mid-exit
        exitTimeouts.current.forEach((timeout, fieldId) => {
            if (currentIds.has(fieldId)) {
                window.clearTimeout(timeout);
                exitTimeouts.current.delete(fieldId);
            }
        });

        setRows((prev) => {
            const next: RenderedRow[] = fields.map((field) => ({
                ...field,
                isExiting: false,
            }));
            prev.forEach((row, index) => {
                if (!currentIds.has(row.fieldId)) {
                    next.splice(Math.min(index, next.length), 0, {
                        ...row,
                        isExiting: true,
                    });
                }
            });
            return next;
        });
    }, [fields]);

    useEffect(() => {
        rows.forEach((row) => {
            if (row.isExiting && !exitTimeouts.current.has(row.fieldId)) {
                const timeout = window.setTimeout(() => {
                    exitTimeouts.current.delete(row.fieldId);
                    setRows((current) =>
                        current.filter(
                            (r) => !(r.fieldId === row.fieldId && r.isExiting),
                        ),
                    );
                }, EXIT_ANIMATION_MS);
                exitTimeouts.current.set(row.fieldId, timeout);
            }
        });
    }, [rows]);

    useEffect(() => {
        const timeouts = exitTimeouts.current;
        return () => {
            timeouts.forEach((timeout) => window.clearTimeout(timeout));
        };
    }, []);

    if (rows.length === 0) return null;

    return (
        <div className={classes.section}>
            <div className={classes.divider}>Selected</div>
            <div className={classes.list} data-testid="SelectedFieldsSection">
                {rows.map((row) => (
                    <SelectedFieldRow
                        key={row.fieldId}
                        row={row}
                        onDeselect={onDeselect}
                    />
                ))}
            </div>
            <div className={classes.divider}>All fields</div>
        </div>
    );
};

const SelectedFieldsSection = memo(SelectedFieldsSectionComponent);
SelectedFieldsSection.displayName = 'SelectedFieldsSection';

export default SelectedFieldsSection;
