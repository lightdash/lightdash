import { useControlsEditorSelector } from './useControlsEditor';
import { useDateZoomEditorSelector } from './useDateZoomEditor';
import { useParameterEditorSelector } from './useParameterEditor';

/** A filter, a parameter control or a date zoom is in its editor; `isEditorOnly` counts only edits made in edit mode. */
export const useIsControlEdited = (isEditorOnly = false): boolean => {
    const isFilterEdited = useControlsEditorSelector(
        (c) => c.isEditorOpen && !(isEditorOnly && c.isViewer),
    );
    const isParameterEdited = useParameterEditorSelector(
        (c) => c.editingId !== null && !(isEditorOnly && c.isViewer),
    );
    const isDateZoomEdited = useDateZoomEditorSelector(
        (c) => c.editingId !== null && !(isEditorOnly && c.isViewer),
    );
    return isFilterEdited || isParameterEdited || isDateZoomEdited;
};
