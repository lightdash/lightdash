import { isReservedParameterName } from '@lightdash/common';
import { Button, Group, Menu } from '@mantine/core';
import { useCallback, useEffect, useState, type FC } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { useDashboardControls } from './context';
import {
    getControlForKey,
    getControlLabel,
    getMissingParameterKeys,
    getParameterType,
    hasUnknownParameterReferences,
} from './parameterMapping';
import { useParameterTiles } from './useParameterControlModel';

type Props = {
    tileUuid: string;
    parameterKey: string;
};

// Offered on a tile for a parameter that no control sets (edit mode only)
const TileParameterControlPrompt: FC<Props> = ({ tileUuid, parameterKey }) => {
    const {
        isEnabled,
        isEditMode,
        draft,
        parameterControls,
        openForTileParameter,
        mapTileToParameterControl,
        requestParameterReferences,
    } = useDashboardControls();
    const definitions = useDashboardContext((c) => c.parameterDefinitions);
    const tiles = useParameterTiles();
    // What was clicked while the tiles' references were still unknown:
    // a control id, or null for a new control
    const [pending, setPending] = useState<{ controlId: string | null }>();

    // Nothing is written until every tile's references are known
    const isLoadingReferences = hasUnknownParameterReferences(tiles);

    const run = useCallback(
        (controlId: string | null) =>
            controlId === null
                ? openForTileParameter(tileUuid, parameterKey)
                : mapTileToParameterControl(controlId, tileUuid, parameterKey),
        [
            openForTileParameter,
            mapTileToParameterControl,
            tileUuid,
            parameterKey,
        ],
    );

    // The click goes through once the references it asked for are in
    useEffect(() => {
        if (!pending || isLoadingReferences) return;
        setPending(undefined);
        run(pending.controlId);
    }, [pending, isLoadingReferences, run]);

    // Not offered inside a previewed tile: a control is already open
    const isOffered =
        isEnabled &&
        isEditMode &&
        draft === null &&
        !isReservedParameterName(parameterKey) &&
        !getControlForKey(parameterControls, parameterKey);
    if (!isOffered) return null;

    // Tiles on other tabs only report their references once asked to
    const handle = (controlId: string | null) => {
        if (!isLoadingReferences) {
            run(controlId);
            return;
        }
        requestParameterReferences();
        setPending({ controlId });
    };
    const isWaiting = pending !== undefined;

    // Any control of the parameter's type can take it
    const type = getParameterType(definitions[parameterKey]);
    const compatibleControls = parameterControls.filter(
        (control) =>
            control.parameterKeys.length > 0 &&
            getParameterType(definitions[control.parameterKeys[0]]) === type,
    );

    // Opens the panel with a new control that has only this tile mapped
    const handleAdd = () => handle(null);

    const stopDrag = {
        onMouseDown: (event: React.MouseEvent) => event.stopPropagation(),
        onTouchStart: (event: React.TouchEvent) => event.stopPropagation(),
    };

    if (compatibleControls.length === 0) {
        return (
            <Group className="non-draggable" {...stopDrag}>
                <Button
                    size="compact-xs"
                    variant="light"
                    loading={isWaiting}
                    onClick={handleAdd}
                >
                    Add control
                </Button>
            </Group>
        );
    }

    return (
        <Group className="non-draggable" {...stopDrag}>
            <Menu position="bottom-start" withinPortal>
                <Menu.Target>
                    <Button
                        size="compact-xs"
                        variant="light"
                        loading={isWaiting}
                    >
                        Add control
                    </Button>
                </Menu.Target>
                <Menu.Dropdown>
                    {compatibleControls.map((control) => (
                        <Menu.Item
                            key={control.id}
                            disabled={isWaiting}
                            onClick={() => handle(control.id)}
                        >
                            {getControlLabel(control, definitions)}
                        </Menu.Item>
                    ))}
                    <Menu.Divider />
                    <Menu.Item disabled={isWaiting} onClick={handleAdd}>
                        Add control
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
        </Group>
    );
};

// The prompt next to a tile's "Missing parameters" message
export const TileMissingParametersPrompt: FC<{
    tileUuid: string;
    errorMessage: string | undefined;
}> = ({ tileUuid, errorMessage }) => {
    const { isEnabled, isEditMode, draft } = useDashboardControls();
    const keys = getMissingParameterKeys(errorMessage);
    if (!isEnabled || !isEditMode || draft !== null || keys.length === 0) {
        return null;
    }
    return (
        <Group gap="xs" justify="center">
            {keys.map((key) => (
                <TileParameterControlPrompt
                    key={key}
                    tileUuid={tileUuid}
                    parameterKey={key}
                />
            ))}
        </Group>
    );
};

export default TileParameterControlPrompt;
