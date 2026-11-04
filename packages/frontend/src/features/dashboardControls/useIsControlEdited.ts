import { useControlsSidebarSelector } from './useControlsSidebar';
import { useParameterEditorSelector } from './useParameterEditor';

/** A filter or a parameter control is in its editor; `isEditorOnly` counts only edits made in edit mode. */
export const useIsControlEdited = (isEditorOnly = false): boolean => {
    const isFilterEdited = useControlsSidebarSelector(
        (c) => c.isSidebarOpen && !(isEditorOnly && c.isViewer),
    );
    const isParameterEdited = useParameterEditorSelector(
        (c) => c.editingId !== null && !(isEditorOnly && c.isViewer),
    );
    return isFilterEdited || isParameterEdited;
};
