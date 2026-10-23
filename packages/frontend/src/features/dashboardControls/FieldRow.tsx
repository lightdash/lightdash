import { type DashboardFilterableField } from '@lightdash/common';
import { interpolateUiString } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Group,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { formatTileCount } from './fieldLabels';
import classes from './FieldsAndTiles.module.css';

type Props = {
    field: DashboardFilterableField | null;
    label: string;
    tableLabel: string;
    // Tiles on the field, of the tiles that offer it, over every tab
    applied: number;
    possible: number;
    isHighlighted: boolean;
    // On no tile yet
    isWaiting: boolean;
    // The tiles' fields are not loaded: removing would write blind
    isRemoveDisabled: boolean;
    onToggleHighlight: () => void;
    onHoverChange: (isHovered: boolean) => void;
    onRemove: () => void;
};

// One line: icon, name, the tiles it is on, and the trash can
export const FieldRow: FC<Props> = ({
    field,
    label,
    tableLabel,
    applied,
    possible,
    isHighlighted,
    isWaiting,
    isRemoveDisabled,
    onToggleHighlight,
    onHoverChange,
    onRemove,
}) => {
    const getUiString = useUiStrings();
    return (
        <Box
            className={
                isHighlighted
                    ? `${classes.row} ${classes.rowHighlighted}`
                    : classes.row
            }
            data-waiting={isWaiting || undefined}
            onMouseEnter={() => onHoverChange(true)}
            onMouseLeave={() => onHoverChange(false)}
        >
            <UnstyledButton
                className={classes.rowMain}
                data-highlighted={isHighlighted || undefined}
                aria-pressed={isHighlighted}
                onClick={onToggleHighlight}
                onFocus={() => onHoverChange(true)}
                onBlur={() => onHoverChange(false)}
            >
                <Group gap="xs" wrap="nowrap" className={classes.rowLabel}>
                    {field !== null && (
                        <FieldIcon item={field} size={14} aria-hidden />
                    )}
                    <Text fz="sm" truncate>
                        {label}
                    </Text>
                </Group>
            </UnstyledButton>
            <Tooltip
                label={interpolateUiString(
                    getUiString(
                        possible === 1
                            ? 'filters.rail.fieldTilesTooltip.singular'
                            : 'filters.rail.fieldTilesTooltip.plural',
                    ),
                    { table: tableLabel, applied, total: possible },
                )}
            >
                <Text
                    key={`${applied}/${possible}`}
                    fz="xs"
                    c="dimmed"
                    className={classes.rowCount}
                >
                    {formatTileCount(getUiString, applied)}
                </Text>
            </Tooltip>
            <Tooltip label={getUiString('filters.rail.removeField')}>
                <ActionIcon
                    className={classes.rowRemove}
                    size="sm"
                    variant="subtle"
                    color="gray"
                    aria-label={interpolateUiString(
                        getUiString('filters.rail.removeFieldName'),
                        { field: label },
                    )}
                    disabled={isRemoveDisabled}
                    onClick={onRemove}
                >
                    <MantineIcon icon={IconTrash} size={14} />
                </ActionIcon>
            </Tooltip>
        </Box>
    );
};
