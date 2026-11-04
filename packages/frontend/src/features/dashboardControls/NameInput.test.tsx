import { fireEvent, screen } from '@testing-library/react';
import { useRef, useState, type FC } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { NameInput } from './NameInput';

const removals: boolean[] = [];

// A browser blurs a focused input as it leaves the page, while React is
// still removing it; jsdom does not, so the holder does it the same way
const Holder: FC<{ onCommit: (text: string) => void }> = ({ onCommit }) => {
    const [isShown, setIsShown] = useState(true);
    const isPatched = useRef(false);
    return (
        <>
            <button type="button" onClick={() => setIsShown(false)}>
                Dismiss
            </button>
            <div
                ref={(node) => {
                    if (node === null || isPatched.current) return;
                    isPatched.current = true;
                    const removeChild = node.removeChild.bind(node);
                    node.removeChild = <T extends Node>(child: T): T => {
                        removals.push(!!node.querySelector('input'));
                        node.querySelector('input')?.dispatchEvent(
                            new FocusEvent('focusout', { bubbles: true }),
                        );
                        return removeChild(child);
                    };
                }}
            >
                {isShown && (
                    <NameInput
                        initial=""
                        placeholder="Label"
                        onCommit={onCommit}
                        onDone={vi.fn()}
                    />
                )}
            </div>
        </>
    );
};

describe('NameInput', () => {
    it('commits nothing when it leaves the page mid-rename, as on a press outside', () => {
        const onCommit = vi.fn();
        renderWithProviders(<Holder onCommit={onCommit} />);
        fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
            target: { value: 'Foo' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(
            screen.queryByRole('textbox', { name: 'Name' }),
        ).not.toBeInTheDocument();
        expect(removals).toEqual([true]);
        expect(onCommit).not.toHaveBeenCalled();
    });

    it('still commits on blur while it stays', () => {
        const onCommit = vi.fn();
        renderWithProviders(<Holder onCommit={onCommit} />);
        const input = screen.getByRole('textbox', { name: 'Name' });
        fireEvent.change(input, { target: { value: 'Foo' } });
        fireEvent.blur(input);
        expect(onCommit).toHaveBeenCalledWith('Foo');
    });
});
