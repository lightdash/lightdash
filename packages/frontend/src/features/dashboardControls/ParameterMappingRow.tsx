import { ActionIcon, Box, Button, Group, Text, Tooltip } from '@mantine/core';
import { IconAdjustmentsHorizontal, IconArrowLeft } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { selectDashboardTiles, useDashboardSelector } from '../dashboard/store';
import filterClasses from '../dashboardFilters/ActiveFilters/Filter.module.css';
import { formatTilesOf } from './fieldLabels';
import {
    chipMarker,
    findFieldBarStart,
    focusOnMount,
    mappingRowMarker,
} from './mappingFocus';
import classes from './MappingRow.module.css';
import { useRailContractClasses } from './railContractClasses';
import { useParameterEditorSelector } from './useParameterEditor';
import {
    useParameterMapping,
    type ParameterMapping,
} from './useParameterMapping';

// A parameter the control sets: hovering it rings the tiles the control
// sets through it, as a filter's field chip does
const KeyChip: FC<{
    mapping: ParameterMapping;
    parameterKey: string;
    isSelected: boolean;
    onClick: () => void;
}> = ({ mapping, parameterKey, isSelected, onClick }) => {
    const hoveredKey = useParameterEditorSelector((c) => c.hoveredKey);
    const hoverKey = useParameterEditorSelector((c) => c.hoverKey);
    const hover = (isHovered: boolean) => {
        if (isHovered) hoverKey(parameterKey);
        else if (hoveredKey === parameterKey) hoverKey(null);
    };
    return (
        <Button
            size="xs"
            variant="default"
            className={classes.chip}
            aria-pressed={isSelected}
            data-selected={isSelected || undefined}
            {...chipMarker(parameterKey)}
            // The bar is portalled after the tiles: Tab goes there
            onKeyDown={(event) => {
                if (event.key !== 'Tab' || event.shiftKey || !isSelected)
                    return;
                const start = findFieldBarStart();
                if (start === null) return;
                event.preventDefault();
                start.focus();
            }}
            onClick={onClick}
            onMouseEnter={() => hover(true)}
            onMouseLeave={() => hover(false)}
            onFocus={() => hover(true)}
            onBlur={() => hover(false)}
        >
            {mapping.nameOf(parameterKey)}
        </Button>
    );
};

const MappingRowContent: FC<{ mapping: ParameterMapping }> = ({ mapping }) => {
    const getUiString = useUiStrings();
    const selectedKey = useParameterEditorSelector((c) => c.selectedKey);
    const selectKey = useParameterEditorSelector((c) => c.selectKey);
    const endMapping = useParameterEditorSelector((c) => c.endMapping);
    const cancelMapping = useParameterEditorSelector((c) => c.cancelMapping);
    const apply = useParameterEditorSelector((c) => c.apply);
    const clearAllTiles = useParameterEditorSelector((c) => c.clearAllTiles);
    const tiles = useDashboardSelector(selectDashboardTiles);
    const { control, name } = mapping;
    const total = mapping.takeableTileUuids.length;
    const format = (count: number) => {
        const tilesOf = formatTilesOf(getUiString, count, total);
        return `${tilesOf.count} ${tilesOf.noun}`;
    };
    const applied = mapping.setTileUuids.length;
    const applyBlockedReason = null;

    return (
        <>
            <Tooltip fz="xs" label="Back to parameter">
                <ActionIcon
                    variant="subtle"
                    size="sm"
                    aria-label="Back to parameter"
                    onClick={endMapping}
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
                    data-in-effect={control.value !== null || undefined}
                    classNames={{ label: filterClasses.label }}
                    className={`${filterClasses.button} ${filterClasses.plain}`}
                    leftSection={
                        <MantineIcon
                            icon={IconAdjustmentsHorizontal}
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
            {/* One sentence: "[pill] sets 4 of 6 tiles through [chips]" */}
            <Text fz="sm" className={classes.words}>
                sets
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
            <Text fz="sm" className={classes.words}>
                through
            </Text>
            {mapping.controlKeys.map((key) => (
                <KeyChip
                    key={key}
                    mapping={mapping}
                    parameterKey={key}
                    isSelected={selectedKey === key}
                    onClick={() => selectKey(selectedKey === key ? null : key)}
                />
            ))}
            <Button
                variant="subtle"
                color="gray"
                size="xs"
                onClick={() =>
                    clearAllTiles((tiles ?? []).map(({ uuid }) => uuid))
                }
            >
                Clear all tiles
            </Button>
            <Group gap="xs" wrap="nowrap" className={classes.actions}>
                <Button variant="default" size="xs" onClick={cancelMapping}>
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
                            onClick={apply}
                        >
                            {getUiString('filters.apply')}
                        </Button>
                    </Box>
                </Tooltip>
            </Group>
        </>
    );
};

// In the bar's place while a parameter control's tiles are chosen, as the
// filter's mapping row: back, the open pill, its count, a chip per parameter
export const ParameterMappingRow: FC = () => {
    const mapping = useParameterMapping();
    const contractClasses = useRailContractClasses();
    if (mapping === null) return null;
    return (
        <Group
            className={
                contractClasses === null
                    ? classes.row
                    : `${classes.row} ${contractClasses.rail}`
            }
            gap="xs"
            tabIndex={-1}
            ref={focusOnMount}
            data-controls-editor
            {...mappingRowMarker}
        >
            <MappingRowContent mapping={mapping} />
        </Group>
    );
};
