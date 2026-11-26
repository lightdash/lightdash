import {
    Editor,
    type Editor as CodeEditor,
    type EditorFactory,
    type EditorOptions,
    type EditorType,
} from '@pierre/diffs/edit';
import { type StudioChatCode } from './studioChatRefs';

/** The shortcut modifier as this platform writes it: ⌘ on Apple devices, Ctrl+ elsewhere. */
const IS_APPLE = /Mac|iPhone|iPad/.test(navigator.userAgent);
export const MOD_KEY = IS_APPLE ? '⌘' : 'Ctrl+';
export const REDO_KEYS = IS_APPLE ? '⇧⌘Z' : 'Ctrl+Shift+Z';

/** The editor Pierre attaches to code that is being edited. */
export const createEditor: EditorFactory<undefined, undefined> = (
    type,
    options,
    key,
) => new Editor(type, options, key);

type Point = { line: number; character: number };

const offsetOf = (lines: string[], at: Point) =>
    lines
        .slice(0, at.line)
        .reduce((total, line) => total + line.length + 1, at.character);

export type Attached = Pick<
    CodeEditor,
    | 'getText'
    | 'getViewState'
    | 'setViewState'
    | 'getEditState'
    | 'setMarkers'
    | 'undo'
    | 'redo'
    | 'canUndo'
    | 'canRedo'
    | 'focus'
    | 'applyEdits'
    | 'setSelections'
>;

const positionAt = (text: string, offset: number) => {
    const before = text.slice(0, offset).split('\n');
    return {
        line: before.length - 1,
        character: before[before.length - 1].length,
    };
};

/** Replaces the document with `text` as one edit over only the part that differs, so undo brings it back and the view stays put. */
export const replaceText = (code: Attached, text: string) => {
    const current = code.getText();
    if (current === text) return;
    let start = 0;
    while (start < current.length && current[start] === text[start]) start += 1;
    let end = 0;
    while (
        end < current.length - start &&
        end < text.length - start &&
        current[current.length - 1 - end] === text[text.length - 1 - end]
    )
        end += 1;
    code.applyEdits([
        {
            range: {
                start: positionAt(current, start),
                end: positionAt(current, current.length - end),
            },
            newText: text.slice(start, text.length - end),
        },
    ]);
};

/** Whether any text is selected, rather than a bare caret. */
export const hasSelection = (code: Attached) =>
    (code.getViewState().selections ?? []).some(
        ({ start, end }) =>
            start.line !== end.line || start.character !== end.character,
    );

/** Selects the word around a point, as a double-click would. */
export const selectWordAt = (
    code: Attached,
    { lineNumber, character }: CodePoint,
) => {
    const line = code.getText().split('\n')[lineNumber - 1] ?? '';
    let start = character;
    let end = character;
    while (start > 0 && /\w/.test(line[start - 1])) start -= 1;
    while (end < line.length && /\w/.test(line[end])) end += 1;
    code.setSelections([
        {
            start: { line: lineNumber - 1, character: start },
            end: { line: lineNumber - 1, character: end },
            direction: 'forward',
        },
    ]);
};

/** The selected lines and text, from Pierre's zero-based selection. */
export const readSelection = (
    code: Attached | null,
): Omit<StudioChatCode, 'path'> | null => {
    const range = code?.getViewState().selections?.[0];
    if (!code || !range) return null;
    const lines = code.getText().split('\n');
    const text = code
        .getText()
        .slice(offsetOf(lines, range.start), offsetOf(lines, range.end));
    if (!text.trim()) return null;
    // A selection ending at the start of a line stops on the line before it.
    const endsAtLineStart =
        range.end.character === 0 && range.end.line > range.start.line;
    return {
        from: range.start.line + 1,
        to: endsAtLineStart ? range.end.line : range.end.line + 1,
        text,
    };
};

/** Pierre draws in a shadow root, so the chip is plain DOM styled with Mantine's variables. */
const createChip = (onClick: () => void) => {
    const button = document.createElement('button');
    button.type = 'button';
    const shortcut = document.createElement('span');
    shortcut.textContent = `${MOD_KEY}L`;
    shortcut.style.opacity = '0.6';
    button.append('Add to chat', shortcut);
    // Black on light, inverted on dark so it still stands out.
    Object.assign(button.style, {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        font: '600 13px var(--mantine-font-family)',
        padding: '6px 12px',
        cursor: 'pointer',
        color: 'light-dark(var(--mantine-color-white), var(--mantine-color-black))',
        background:
            'light-dark(var(--mantine-color-black), var(--mantine-color-white))',
        border: 'none',
        borderRadius: 'var(--mantine-radius-md)',
        boxShadow: 'var(--mantine-shadow-md)',
    });
    // Keeps the selection: a mousedown here would move the caret.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', onClick);
    return button;
};

export const editorOptionsFor = <T extends EditorType>(
    onAttach: (code: Attached) => void,
    onAddToChat: () => void,
): EditorOptions<T, undefined, undefined> => ({
    enabledSelectionAction: true,
    renderSelectionAction: (context) =>
        createChip(() => {
            onAddToChat();
            context.close();
        }),
    onAttach,
});

/** Esc on a bare caret leaves the editor, since Tab indents inside it and would trap keyboard focus. */
export const leaveOnEscape = (event: KeyboardEvent, code: Attached | null) => {
    if (event.key !== 'Escape' || event.isComposing) return;
    const isCaret =
        !!code &&
        code.getViewState().selections?.length === 1 &&
        !hasSelection(code);
    const focused = event.composedPath()[0];
    if (isCaret && focused instanceof HTMLElement) focused.blur();
};

export type CodePoint = { lineNumber: number; character: number };

/** Where a click landed in Pierre's rendered code (one-based line, zero-based character), or null off a line of the new file. */
export const pointInCode = (event: MouseEvent): CodePoint | null => {
    const path = event.composedPath();
    const line = path.find(
        (node): node is HTMLElement =>
            node instanceof HTMLElement && node.dataset.line !== undefined,
    );
    if (!line || line.dataset.lineType?.includes('deletion')) return null;
    const lineNumber = Number(line.dataset.line);
    if (!Number.isInteger(lineNumber)) return null;
    const root = line.getRootNode();
    const caret =
        root instanceof ShadowRoot && 'caretPositionFromPoint' in document
            ? document.caretPositionFromPoint(event.clientX, event.clientY, {
                  shadowRoots: [root],
              })
            : null;
    // Past the end of the text, the caret goes to the end of the line.
    if (!caret || !line.contains(caret.offsetNode))
        return { lineNumber, character: line.textContent?.length ?? 0 };
    const before = document.createRange();
    before.setStart(line, 0);
    before.setEnd(caret.offsetNode, caret.offset);
    return { lineNumber, character: before.toString().length };
};
