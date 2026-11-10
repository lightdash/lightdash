import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type FC } from 'react';
import { describe, expect, it, vi } from 'vitest';
import FilterMultiStringInput from '../../components/common/Filters/FilterInputs/FilterMultiStringInput';
import MantineProvider from '../../providers/MantineProvider';
import { renderWithProviders } from '../../testing/testUtils';
import { useEditorDismiss } from './useEditorDismiss';

type Props = {
    onChange: (values: string[]) => void;
    onDismiss: () => void;
    onDismissOutside: () => void;
};

const Editor: FC<Props> = ({ onChange, onDismiss, onDismissOutside }) => {
    const [isOpen, setIsOpen] = useState(true);
    useEditorDismiss({
        isOpen,
        isFieldClicked: false,
        isAsking: false,
        isPristineNew: false,
        clearField: () => {},
        dismiss: () => {
            onDismiss();
            setIsOpen(false);
        },
        dismissOutside: () => {
            onDismissOutside();
            setIsOpen(false);
        },
    });
    if (!isOpen) return null;
    return (
        <div data-controls-editor data-testid="editor">
            <FilterMultiStringInput values={[]} onChange={onChange} />
        </div>
    );
};

const renderWithPastePrompt = async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onDismiss = vi.fn();
    const onDismissOutside = vi.fn();
    renderWithProviders(
        // Portalled dropdowns, as in the browser
        <MantineProvider env="default">
            <Editor
                onChange={onChange}
                onDismiss={onDismiss}
                onDismissOutside={onDismissOutside}
            />
        </MantineProvider>,
    );
    const input = screen.getByRole('textbox');
    await user.click(input);
    // A browser paste fires the event, then inserts the text
    fireEvent.paste(input, {
        clipboardData: { getData: () => 'US, us, GB' },
    });
    fireEvent.change(input, { target: { value: 'US, us, GB' } });
    expect(
        await screen.findByRole('button', { name: /multiple values/i }),
    ).toBeInTheDocument();
    return { user, onChange, onDismiss, onDismissOutside };
};

const pastePrompt = () =>
    screen.queryByRole('button', { name: /multiple values/i });

describe('paste prompt inside the dashboard filter editor', () => {
    it('Escape closes the prompt and keeps the editor, then the next Escape cancels', async () => {
        const { user, onChange, onDismiss, onDismissOutside } =
            await renderWithPastePrompt();

        await user.keyboard('{Escape}');

        await waitFor(() => expect(pastePrompt()).not.toBeInTheDocument());
        expect(screen.getByTestId('editor')).toBeInTheDocument();
        expect(onDismiss).not.toHaveBeenCalled();
        expect(onDismissOutside).not.toHaveBeenCalled();

        await user.keyboard('{Escape}');

        expect(onDismiss).toHaveBeenCalledTimes(1);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('a press outside closes the prompt and keeps the editor, then the next press cancels', async () => {
        const { user, onChange, onDismissOutside } =
            await renderWithPastePrompt();

        await user.click(document.body);

        await waitFor(() => expect(pastePrompt()).not.toBeInTheDocument());
        expect(screen.getByTestId('editor')).toBeInTheDocument();
        expect(onDismissOutside).not.toHaveBeenCalled();

        await user.click(document.body);

        expect(onDismissOutside).toHaveBeenCalledTimes(1);
        expect(onChange).not.toHaveBeenCalled();
    });
});
