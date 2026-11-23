import { Editor, type EditorFactory } from '@pierre/diffs/edit';

export type StudioEditor = ReturnType<EditorFactory<undefined, undefined>>;

/** The editor Pierre attaches to code that is being edited. */
export const createEditor: EditorFactory<undefined, undefined> = (
    type,
    options,
    key,
) => new Editor(type, options, key);

/** Same editor, handed to `onCreate` so a toolbar can undo and redo it. */
export const createTrackedEditor =
    (
        onCreate: (editor: StudioEditor) => void,
    ): EditorFactory<undefined, undefined> =>
    (type, options, key) => {
        const editor = createEditor(type, options, key);
        onCreate(editor);
        return editor;
    };
