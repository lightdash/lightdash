import { IconCalendarSearch } from '@tabler/icons-react';
import { type FC } from 'react';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { ControlMappingRow } from './ControlMappingRow';
import { useDateZoomEditorSelector } from './useDateZoomEditor';
import { useDateZoomMapping } from './useDateZoomMapping';

// In the bar's place while a date zoom's tiles are chosen, as the
// parameter's mapping row
export const DateZoomMappingRow: FC = () => {
    const getUiString = useUiStrings();
    const mapping = useDateZoomMapping();
    const endMapping = useDateZoomEditorSelector((c) => c.endMapping);
    const cancelMapping = useDateZoomEditorSelector((c) => c.cancelMapping);
    const apply = useDateZoomEditorSelector((c) => c.apply);
    const setTiles = useDateZoomEditorSelector((c) => c.setTiles);
    if (mapping === null) return null;
    const applied = mapping.zoomedTileUuids.length;
    return (
        <ControlMappingRow
            backLabel={getUiString('controls.dateZoom.backToDateZoom')}
            onBack={endMapping}
            icon={IconCalendarSearch}
            name={mapping.name}
            isInEffect={applied > 0}
            verb={getUiString('controls.dateZoom.appliesToWord')}
            applied={applied}
            total={mapping.takeableTileUuids.length}
            afterCount={null}
            onClearAll={() =>
                setTiles(
                    mapping.zoomedTileUuids.map((tileUuid) => ({
                        tileUuid,
                        target: null,
                    })),
                    'clear',
                )
            }
            isClearAllDisabled={applied === 0}
            onCancel={cancelMapping}
            onApply={apply}
            // As the popover's: a zoom on no tiles does nothing
            applyBlockedReason={
                applied === 0 ? 'Choose at least one tile' : null
            }
        />
    );
};
