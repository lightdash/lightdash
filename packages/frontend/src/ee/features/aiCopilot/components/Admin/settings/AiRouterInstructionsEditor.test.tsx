import { act, screen } from '@testing-library/react';
import { type Editor } from '@tiptap/react';
import { expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { instructionTextToHtml } from '../../../utils/aiRouterInstructions';
import { AiRouterInstructionsEditor } from './AiRouterInstructionsEditor';

const INSTRUCTION = [
    'Route billing questions to @[Finance Agent](agent-1).',
    'Route sales questions to @[Sales Agent](agent-2).',
    '',
    'Otherwise answer directly.',
].join('\n');

const saveAndReopen = (instruction: string): string => {
    const onChange = vi.fn();
    const { unmount } = renderWithProviders(
        <AiRouterInstructionsEditor
            suggestions={[]}
            initialInstruction={instruction}
            onChange={onChange}
        />,
    );
    const { editor } = screen.getByRole('textbox') as HTMLElement & {
        editor: Editor;
    };
    act(() => {
        editor.commands.clearContent();
        editor.commands.setContent(instructionTextToHtml(instruction));
    });
    unmount();
    return onChange.mock.lastCall?.[0];
};

it('keeps line breaks stable across save and reopen', () => {
    const firstSave = saveAndReopen(INSTRUCTION);
    expect(firstSave).toBe(INSTRUCTION);
    expect(saveAndReopen(firstSave)).toBe(INSTRUCTION);
});
