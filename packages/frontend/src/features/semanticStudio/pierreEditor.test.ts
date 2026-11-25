import { describe, expect, it, vi } from 'vitest';
import {
    readSelection,
    replaceText,
    selectWordAt,
    type Attached,
} from './pierreEditor';

type Range = {
    start: { line: number; character: number };
    end: { line: number; character: number };
};

const editorWith = (text: string, selection: Range | null = null) => {
    const applyEdits = vi.fn();
    const setSelections = vi.fn();
    const code: Attached = {
        getText: () => text,
        getViewState: () => ({
            selections: selection
                ? [{ ...selection, direction: 1 as const }]
                : [],
        }),
        setViewState: vi.fn(),
        getEditState: () => undefined,
        setMarkers: vi.fn(),
        undo: vi.fn(),
        redo: vi.fn(),
        canUndo: false,
        canRedo: false,
        focus: vi.fn(),
        applyEdits,
        setSelections,
    };
    return { code, applyEdits, setSelections };
};

describe('replaceText', () => {
    it('replaces only the part that differs', () => {
        const { code, applyEdits } = editorWith('name: oXrders\nlabel: Orders');
        replaceText(code, 'name: orders\nlabel: Orders');
        expect(applyEdits).toHaveBeenCalledWith([
            {
                range: {
                    start: { line: 0, character: 7 },
                    end: { line: 0, character: 8 },
                },
                newText: '',
            },
        ]);
    });

    it('does nothing when the text is unchanged', () => {
        const { code, applyEdits } = editorWith('a\nb');
        replaceText(code, 'a\nb');
        expect(applyEdits).not.toHaveBeenCalled();
    });
});

describe('readSelection', () => {
    it('stops on the last selected line when the selection ends at the next line start', () => {
        const { code } = editorWith('one\ntwo\nthree', {
            start: { line: 1, character: 0 },
            end: { line: 2, character: 0 },
        });
        expect(readSelection(code)).toEqual({
            from: 2,
            to: 2,
            text: 'two\n',
        });
    });
});

describe('selectWordAt', () => {
    it('selects the word around the point', () => {
        const { code, setSelections } = editorWith('a\n    label: Order date');
        selectWordAt(code, { lineNumber: 2, character: 16 });
        expect(setSelections).toHaveBeenCalledWith([
            {
                start: { line: 1, character: 11 },
                end: { line: 1, character: 16 },
                direction: 'forward',
            },
        ]);
    });
});
