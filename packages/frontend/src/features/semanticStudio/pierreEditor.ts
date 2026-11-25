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
    | 'focus'
>;

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
    return { from: range.start.line + 1, to: range.end.line + 1, text };
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
    if (event.key !== 'Escape') return;
    const ranges = code?.getViewState().selections ?? [];
    const [range] = ranges;
    const isCaret =
        ranges.length === 1 &&
        range.start.line === range.end.line &&
        range.start.character === range.end.character;
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
        root instanceof ShadowRoot
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
