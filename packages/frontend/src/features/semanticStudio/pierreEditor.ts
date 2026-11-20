import { Editor, type EditorFactory } from '@pierre/diffs/edit';

/** The editor Pierre attaches to code that is being edited. */
export const createEditor: EditorFactory<undefined, undefined> = (
    type,
    options,
    key,
) => new Editor(type, options, key);
