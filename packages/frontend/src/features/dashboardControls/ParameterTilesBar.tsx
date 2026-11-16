import { getParameterControlSetter } from '@lightdash/common';
import { type FC } from 'react';
import { ControlTilesBar } from './ControlTilesBar';
import { type FieldBarCopy } from './FieldTilesBar';
import { getParameterKeyScope } from './parameterPeers';
import { useParameterEditorSelector } from './useParameterEditor';
import { useParameterMapping } from './useParameterMapping';

// Editors only map parameters: these words never reach a viewer
const PARAMETER_COPY: FieldBarCopy = {
    fillMore: 'Set {count} more',
    fillOnOtherTabs: 'Set {count} on other tabs',
    fillMoreNone: 'Set more',
    region: 'Tiles set through {field}',
    undoFillName: 'Undo setting {tiles} through {field}',
    noTile: 'No tile uses this parameter',
};

// The floating bar for the selected parameter chip
export const ParameterTilesBar: FC = () => {
    const mapping = useParameterMapping();
    const selectedKey = useParameterEditorSelector((c) => c.selectedKey);
    const undo = useParameterEditorSelector((c) => c.mappingUndo);
    const undoMapping = useParameterEditorSelector((c) => c.undoMapping);
    const setKeyTiles = useParameterEditorSelector((c) => c.setKeyTiles);
    const key =
        mapping !== null &&
        selectedKey !== null &&
        mapping.controlKeys.includes(selectedKey)
            ? selectedKey
            : null;
    if (mapping === null || key === null) return null;
    const usesKey = (tileUuid: string) =>
        (mapping.tileParameterReferences[tileUuid] ?? []).includes(key);
    const ownerOf = (tileUuid: string) =>
        getParameterControlSetter(
            mapping.controls,
            key,
            tileUuid,
            mapping.userParameterNames,
        )?.id;
    return (
        <ControlTilesBar
            barKey={key}
            name={mapping.nameOf(key)}
            copy={PARAMETER_COPY}
            labelOf={mapping.controlNameOf}
            // Set more takes only tiles no control sets
            scopeOf={(tileUuids) =>
                getParameterKeyScope({
                    tileUuids,
                    controls: mapping.controls,
                    tileParameterReferences: mapping.tileParameterReferences,
                    controlId: mapping.control.id,
                    key,
                    userParameterNames: mapping.userParameterNames,
                })
            }
            fill={(tileUuids) =>
                setKeyTiles(
                    key,
                    tileUuids.filter(
                        (uuid) => usesKey(uuid) && ownerOf(uuid) === undefined,
                    ),
                    true,
                )
            }
            clear={(tileUuids) =>
                setKeyTiles(
                    key,
                    tileUuids.filter(
                        (uuid) => ownerOf(uuid) === mapping.control.id,
                    ),
                    false,
                )
            }
            undo={undo}
            onUndo={undoMapping}
        />
    );
};
