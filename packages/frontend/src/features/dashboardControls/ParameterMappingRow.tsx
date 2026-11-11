import { Button, Text } from '@mantine/core';
import { IconAdjustmentsHorizontal } from '@tabler/icons-react';
import { type FC } from 'react';
import { selectDashboardTiles, useDashboardSelector } from '../dashboard/store';
import { ControlMappingRow } from './ControlMappingRow';
import { chipMarker, findFieldBarStart } from './mappingFocus';
import classes from './MappingRow.module.css';
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

// In the bar's place while a parameter control's tiles are chosen, as the
// filter's mapping row: back, the open pill, its count, a chip per parameter
export const ParameterMappingRow: FC = () => {
    const mapping = useParameterMapping();
    const selectedKey = useParameterEditorSelector((c) => c.selectedKey);
    const selectKey = useParameterEditorSelector((c) => c.selectKey);
    const endMapping = useParameterEditorSelector((c) => c.endMapping);
    const cancelMapping = useParameterEditorSelector((c) => c.cancelMapping);
    const apply = useParameterEditorSelector((c) => c.apply);
    const clearAllTiles = useParameterEditorSelector((c) => c.clearAllTiles);
    const tiles = useDashboardSelector(selectDashboardTiles);
    if (mapping === null) return null;
    return (
        <ControlMappingRow
            backLabel="Back to parameter"
            onBack={endMapping}
            icon={IconAdjustmentsHorizontal}
            name={mapping.name}
            isInEffect={mapping.control.value !== null}
            verb="sets"
            applied={mapping.appliedTileUuids.length}
            total={mapping.takeableTileUuids.length}
            // "[pill] sets 4 of 6 tiles through [chips]"
            afterCount={
                <>
                    <Text fz="sm" className={classes.words}>
                        through
                    </Text>
                    {mapping.controlKeys.map((key) => (
                        <KeyChip
                            key={key}
                            mapping={mapping}
                            parameterKey={key}
                            isSelected={selectedKey === key}
                            onClick={() =>
                                selectKey(selectedKey === key ? null : key)
                            }
                        />
                    ))}
                </>
            }
            onClearAll={() =>
                clearAllTiles((tiles ?? []).map(({ uuid }) => uuid))
            }
            onCancel={cancelMapping}
            onApply={apply}
        />
    );
};
