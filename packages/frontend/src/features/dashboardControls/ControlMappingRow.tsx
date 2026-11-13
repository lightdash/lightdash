import { ActionIcon, Box, Button, Group, Text, Tooltip } from '@mantine/core';
import { IconArrowLeft, type Icon } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import filterClasses from '../dashboardFilters/ActiveFilters/Filter.module.css';
import { useControlContractClasses } from './controlContractClasses';
import { formatTilesOf } from './fieldLabels';
import { focusOnMount, mappingRowMarker } from './mappingFocus';
import classes from './MappingRow.module.css';

// In the popover's place while a control's tiles are chosen, so an embed's
// editor class goes with it. The popover that held focus is gone: the row
// takes it, so Tab reaches the chips and Escape cancels from here
export const MappingRowFrame: FC<{ children: ReactNode }> = ({ children }) => {
    const contractClasses = useControlContractClasses();
    return (
        <Group
            className={
                contractClasses === null
                    ? classes.row
                    : `${classes.row} ${contractClasses.editor}`
            }
            gap="xs"
            tabIndex={-1}
            ref={focusOnMount}
            data-controls-editor
            {...mappingRowMarker}
        >
            {children}
        </Group>
    );
};

type Props = {
    backLabel: string;
    onBack: () => void;
    icon: Icon;
    name: string;
    isInEffect: boolean;
    /** "applies to", "sets": the sentence's verb before the count. */
    verb: string;
    applied: number;
    total: number;
    /** After the count: the parameter's "through" and its key chips. */
    afterCount: ReactNode;
    onClearAll: () => void;
    onCancel: () => void;
    onApply: () => void;
};

// A parameter's or a date zoom's mapping row: back, the open pill, its
// count, Clear all tiles, Cancel and Apply
export const ControlMappingRow: FC<Props> = ({
    backLabel,
    onBack,
    icon,
    name,
    isInEffect,
    verb,
    applied,
    total,
    afterCount,
    onClearAll,
    onCancel,
    onApply,
}) => {
    const getUiString = useUiStrings();
    // A control on no tiles does nothing; its X removes it
    const applyBlockedReason =
        applied === 0 ? 'Choose at least one tile' : null;
    const format = (count: number) => {
        const tilesOf = formatTilesOf(getUiString, count, total);
        return `${tilesOf.count} ${tilesOf.noun}`;
    };
    return (
        <MappingRowFrame>
            <Tooltip fz="xs" label={backLabel}>
                <ActionIcon
                    variant="subtle"
                    size="sm"
                    aria-label={backLabel}
                    onClick={onBack}
                >
                    <MantineIcon icon={IconArrowLeft} />
                </ActionIcon>
            </Tooltip>
            {/* The open pill names the control; it does nothing here */}
            <Box inert className={classes.pill}>
                <Button
                    size="xs"
                    variant="default"
                    data-open
                    data-in-effect={isInEffect || undefined}
                    classNames={{ label: filterClasses.label }}
                    className={`${filterClasses.button} ${filterClasses.plain}`}
                    leftSection={
                        <MantineIcon
                            icon={icon}
                            size="sm"
                            className={filterClasses.statusIcon}
                        />
                    }
                >
                    <Text span fz="xs" fw={600}>
                        {name}
                    </Text>
                </Button>
            </Box>
            {/* One sentence: "[pill] applies to 4 of 6 tiles" */}
            <Text fz="sm" className={classes.words}>
                {verb}
            </Text>
            <Text
                fz="sm"
                fw={600}
                className={classes.summary}
                data-reserve={format(total)}
                aria-live="polite"
            >
                <span>{format(applied)}</span>
            </Text>
            {afterCount}
            <Button
                variant="subtle"
                color="gray"
                size="xs"
                disabled={applied === 0}
                onClick={onClearAll}
            >
                Clear all tiles
            </Button>
            <Group gap="xs" wrap="nowrap" className={classes.actions}>
                <Button variant="default" size="xs" onClick={onCancel}>
                    {getUiString('filters.actions.cancel')}
                </Button>
                <Tooltip
                    fz="xs"
                    label={applyBlockedReason}
                    disabled={applyBlockedReason === null}
                >
                    <Box>
                        <Button
                            size="xs"
                            data-controls-apply
                            disabled={applyBlockedReason !== null}
                            onClick={onApply}
                        >
                            {getUiString('filters.apply')}
                        </Button>
                    </Box>
                </Tooltip>
            </Group>
        </MappingRowFrame>
    );
};
