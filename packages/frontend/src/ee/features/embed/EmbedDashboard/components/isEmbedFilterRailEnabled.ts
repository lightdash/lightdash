// Viewers get the filter rail; an embed editor in edit mode keeps the
// shipped filters
export const isEmbedFilterRailEnabled = ({
    isFlagEnabled,
    isEditorInEditMode,
}: {
    isFlagEnabled: boolean;
    isEditorInEditMode: boolean;
}): boolean => isFlagEnabled && !isEditorInEditMode;
