import {
    isAdditionalMetric,
    isCustomDimension,
    isDimension,
    isField,
    isMetric,
} from '@lightdash/common';
import { UnstyledButton } from '@mantine-8/core';
import { memo, useCallback, useEffect, useRef, useState, type FC } from 'react';
import FieldIcon from '../../common/Filters/FieldIcon';
import classes from './SelectedFieldsSection.module.css';
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

    const handleClick = useCallback(() => {
        if (!isExiting) onDeselect(fieldId, isDim);
    }, [isExiting, onDeselect, fieldId, isDim]);

    const label = getFieldLabel(item);

    return (
        <UnstyledButton
            className={
                isExiting
                    ? `${classes.row} ${classes.rowExiting}`
                    : classes.row
            }
            data-field-kind={getFieldKind(item)}
            onClick={handleClick}
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
