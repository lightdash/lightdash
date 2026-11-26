type Editor = { firstName: string; lastName: string };

/** A content header's "last edited by" name, when the editor is known. */
export const editorName = (
    editor: Editor | null | undefined,
): string | undefined =>
    editor?.firstName
        ? `${editor.firstName} ${editor.lastName}`.trim()
        : undefined;
