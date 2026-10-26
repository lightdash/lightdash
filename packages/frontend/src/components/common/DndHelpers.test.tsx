import type * as DndKitCore from '@dnd-kit/core';
import { DndContext } from '@dnd-kit/core';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DraggableItem, DroppableArea } from './DndHelpers';

// A drop state dnd-kit would report mid-drag, without the gesture
const mockDroppable = vi.hoisted(() => ({
    current: null as null | { activeId: string; overId: string },
}));
vi.mock('@dnd-kit/core', async (importOriginal) => {
    const actual = await importOriginal<typeof DndKitCore>();
    return {
        ...actual,
        useDroppable: (args: Parameters<typeof actual.useDroppable>[0]) => {
            const real = actual.useDroppable(args);
            const state = mockDroppable.current;
            if (!state) return real;
            return {
                ...real,
                isOver: args.id === state.overId,
                active: { id: state.activeId },
                over: { id: state.overId },
            };
        },
    };
});

describe('DroppableArea', () => {
    afterEach(() => {
        mockDroppable.current = null;
    });

    it.each([
        ['after', ['a', 'b']],
        ['before', ['b', 'a']],
    ])('draws the drop line %s the item under the drag', (side, order) => {
        mockDroppable.current = { activeId: 'a', overId: 'b' };
        const { container } = render(
            <MantineProvider env="test">
                <DndContext>
                    <DroppableArea id="b" orderedKeys={order}>
                        <span>b</span>
                    </DroppableArea>
                </DndContext>
            </MantineProvider>,
        );
        const line = container.querySelector('[class*="dropLine"]');
        expect(line).toHaveAttribute('data-side', side);
    });

    it('draws no line with nothing over it', () => {
        const { container } = render(
            <MantineProvider env="test">
                <DndContext>
                    <DroppableArea id="b" orderedKeys={['a', 'b']}>
                        <span>b</span>
                    </DroppableArea>
                </DndContext>
            </MantineProvider>,
        );
        expect(container.querySelector('[class*="dropLine"]')).toBeNull();
    });
});

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
