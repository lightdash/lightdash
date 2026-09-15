import { DndContext } from '@dnd-kit/core';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DraggableItem } from './DndHelpers';

describe('DraggableItem', () => {
    it('keeps viewer controls keyboard-accessible when dragging is disabled', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(
            <MantineProvider env="test">
                <DndContext>
                    <DraggableItem id="status" disabled>
                        <button onClick={onClick}>Subscription status</button>
                    </DraggableItem>
                </DndContext>
            </MantineProvider>,
        );

        const control = screen.getByRole('button', {
            name: 'Subscription status',
        });
        await user.tab();
        expect(control).toHaveFocus();
        expect(control.closest('[aria-disabled="true"]')).toBeNull();
        await user.keyboard('{Enter}');
        expect(onClick).toHaveBeenCalledOnce();
    });

    it('retains the keyboard drag target when dragging is enabled', async () => {
        const user = userEvent.setup();
        render(
            <MantineProvider env="test">
                <DndContext>
                    <DraggableItem id="status">
                        <span>Subscription status</span>
                    </DraggableItem>
                </DndContext>
            </MantineProvider>,
        );
        const dragTarget = screen.getByRole('button', {
            name: 'Subscription status',
        });
        await user.tab();
        expect(dragTarget).toHaveFocus();
        expect(dragTarget).toHaveAttribute('aria-roledescription', 'draggable');
    });
});
