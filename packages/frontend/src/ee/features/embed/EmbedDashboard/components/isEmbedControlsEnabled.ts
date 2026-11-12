// Viewers get the controls bar; an embed editor in edit mode keeps the
// shipped filters
export const isEmbedControlsEnabled = ({
    isFlagEnabled,
    isEditorInEditMode,
}: {
    isFlagEnabled: boolean;
    isEditorInEditMode: boolean;
}): boolean => isFlagEnabled && !isEditorInEditMode;
