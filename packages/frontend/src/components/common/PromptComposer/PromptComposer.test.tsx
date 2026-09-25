import { fireEvent, screen } from '@testing-library/react';
import { type Editor } from '@tiptap/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import PromptComposer, { type PromptComposerHandle } from './PromptComposer';

/** jsdom can't type into a contenteditable, so drive the editor directly and
 *  dispatch the key events the composer reacts to. */
const setup = (
    props: Partial<Parameters<typeof PromptComposer>[0]> = {},
    text = 'what changed last week',
) => {
    const onSubmit = vi.fn();
    const ref = createRef<PromptComposerHandle>();
    renderWithProviders(
        <PromptComposer ref={ref} onSubmit={onSubmit} {...props} />,
    );
    const editor = ref.current?.editor as Editor;
    editor.commands.setContent(text);
    return { onSubmit, editor, element: screen.getByRole('textbox') };
};

describe('PromptComposer keyboard handling', () => {
    it('submits on Enter', () => {
        const { onSubmit, element } = setup();

        fireEvent.keyDown(element, { key: 'Enter' });

        expect(onSubmit).toHaveBeenCalledWith('what changed last week');
    });

    it('inserts a line break on Shift+Enter instead of submitting', () => {
        const { onSubmit, editor, element } = setup();

        fireEvent.keyDown(element, { key: 'Enter', shiftKey: true });

        expect(onSubmit).not.toHaveBeenCalled();
        expect(editor.getText({ blockSeparator: '\n' })).toContain('\n');
    });

    it('does not submit on Enter during IME composition', () => {
        const { onSubmit, element } = setup({}, 'こんにちは');

        fireEvent.keyDown(element, { key: 'Enter', isComposing: true });

        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('does not submit while another consumer owns Enter', () => {
        const { onSubmit, element } = setup({
            shouldBlockSubmit: () => true,
        });

        fireEvent.keyDown(element, { key: 'Enter' });

        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('does not submit an empty composer', () => {
        const { onSubmit, element } = setup({}, '   ');

        fireEvent.keyDown(element, { key: 'Enter' });

        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('swallows Enter while submission is gated, keeping the draft intact', () => {
        const { onSubmit, editor, element } = setup(
            { submitDisabled: true },
            'queued draft',
        );

        fireEvent.keyDown(element, { key: 'Enter' });

        expect(onSubmit).not.toHaveBeenCalled();
        expect(editor.getText({ blockSeparator: '\n' })).toBe('queued draft');
    });
});

describe('PromptComposer placeholder', () => {
    const placeholderOf = () =>
        document
            .querySelector('[data-placeholder]')
            ?.getAttribute('data-placeholder');

    it('repaints a new placeholder in the same editor, keeping the draft', () => {
        const ref = createRef<PromptComposerHandle>();
        const { rerender } = renderWithProviders(
            <PromptComposer
                ref={ref}
                onSubmit={vi.fn()}
                placeholder="Describe a new chart type…"
            />,
        );
        expect(placeholderOf()).toBe('Describe a new chart type…');
        const editor = ref.current?.editor as Editor;
        editor.commands.setContent('make the bars thinner');

        rerender(
            <PromptComposer
                ref={ref}
                onSubmit={vi.fn()}
                placeholder="Ask for a change…"
            />,
        );

        expect(ref.current?.editor).toBe(editor);
        expect(editor.getText()).toBe('make the bars thinner');
        editor.commands.clearContent();
        expect(placeholderOf()).toBe('Ask for a change…');
    });

    it('shows a new placeholder on an empty composer without a keystroke', () => {
        const ref = createRef<PromptComposerHandle>();
        const { rerender } = renderWithProviders(
            <PromptComposer
                ref={ref}
                onSubmit={vi.fn()}
                placeholder="Describe a new chart type…"
            />,
        );

        rerender(
            <PromptComposer
                ref={ref}
                onSubmit={vi.fn()}
                placeholder="Ask for a change…"
            />,
        );

        expect(placeholderOf()).toBe('Ask for a change…');
    });
});
