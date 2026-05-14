export type EditorMode = 'empty' | 'formula' | 'prompt';

export const getInputMode = (text: string): EditorMode => {
    const trimmed = text.trimStart();
    if (trimmed.length === 0) return 'empty';
    if (trimmed.charAt(0) === '=') return 'formula';
    return 'prompt';
};
