import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import {
    designSessionReducer,
    type Bubble,
    type BubbleInput,
    type DesignAction,
    type DesignSession,
} from '../designSession';
import DesignBubble from './DesignBubble';

const hold = (input: BubbleInput, at: number): DesignAction[] => [
    {
        type: 'holdStarted',
        tool: 'stylus',
        atMs: at,
        tabUuid: null,
        isNewScreen: false,
        newBubble: { id: 'a', input },
    },
    {
        type: 'strokeAdded',
        stroke: {
            points: [
                { x: 0.1, y: 0.1 },
                { x: 0.5, y: 0.5 },
            ],
        },
    },
    {
        type: 'holdEnded',
        atMs: at + 100,
        mark: {
            target: null,
            arrowTo: null,
            trail: [],
            covers: [],
            tabName: null,
            box: null,
        },
        anchor: { x: 10, y: 20 },
    },
];

const bubbleWith = (input: BubbleInput, ...more: DesignAction[]): Bubble => {
    const empty: DesignSession = { bubbles: [], active: { kind: 'page' } };
    return [...hold(input, 0), ...hold(input, 1000), ...more].reduce(
        designSessionReducer,
        empty,
    ).bubbles[0];
};

const setup = (
    bubble: Bubble,
    opts: { passthrough?: boolean; listening?: boolean } = {},
) => {
    const handlers = {
        onSend: vi.fn(),
        onStop: vi.fn(),
        onDiscard: vi.fn(),
        onClose: vi.fn(),
    };
    renderWithProviders(
        <DesignBubble
            bubble={bubble}
            position={{ x: 120, y: 80 }}
            passthrough={opts.passthrough ?? false}
            listening={opts.listening ?? false}
            {...handlers}
        >
            <span>thread area</span>
        </DesignBubble>,
    );
    return handlers;
};

describe('DesignBubble', () => {
    it('Enter sends the typed words', () => {
        const { onSend } = setup(bubbleWith('text'));
        const box = screen.getByRole('textbox');
        fireEvent.change(box, { target: { value: 'make this green' } });
        fireEvent.keyDown(box, { key: 'Enter' });
        expect(onSend).toHaveBeenCalledWith('make this green');
    });

    it('Shift+Enter adds a new line instead of sending', () => {
        const { onSend } = setup(bubbleWith('text'));
        const box = screen.getByRole('textbox');
        fireEvent.change(box, { target: { value: 'one' } });
        const kept = fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
        expect(kept).toBe(true);
        expect(onSend).not.toHaveBeenCalled();
    });

    it('shows a chip for each collected mark', () => {
        setup(bubbleWith('text'));
        expect(screen.getByText('①')).toBeInTheDocument();
        expect(screen.getByText('②')).toBeInTheDocument();
    });

    it('Stop is shown while listening', () => {
        const { onStop } = setup(bubbleWith('mic'), { listening: true });
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
        expect(onStop).toHaveBeenCalledTimes(1);
    });

    it('passthrough turns off pointer events', () => {
        setup(bubbleWith('text'), { passthrough: true });
        expect(document.querySelector('[data-bubble-id="a"]')).toHaveAttribute(
            'data-passthrough',
            'true',
        );
    });

    it('sits at the position it is given', () => {
        setup(bubbleWith('text'));
        const root = document.querySelector(
            '[data-bubble-id="a"]',
        ) as HTMLElement;
        expect(root.style.getPropertyValue('--bubble-left')).toBe('120px');
        expect(root.style.getPropertyValue('--bubble-top')).toBe('80px');
        expect(root).toHaveAttribute('data-passthrough', 'false');
    });

    it('an unsent bubble is thrown away by its close button', () => {
        const { onDiscard, onClose } = setup(bubbleWith('text'));
        fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
        expect(onDiscard).toHaveBeenCalledTimes(1);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('a queued bubble shows a badge and no input', () => {
        setup(bubbleWith('text', { type: 'queue', bubbleId: 'a' }));
        expect(screen.getByText('Queued')).toBeInTheDocument();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('picking an agent shows the picker it is given', () => {
        setup(
            bubbleWith('text', {
                type: 'sendStarted',
                bubbleId: 'a',
                needsPicker: true,
            }),
        );
        expect(screen.getByText('thread area')).toBeInTheDocument();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('a sent bubble shows its thread and closes', () => {
        const { onClose } = setup(
            bubbleWith(
                'text',
                { type: 'sendStarted', bubbleId: 'a', needsPicker: false },
                {
                    type: 'threadReady',
                    bubbleId: 'a',
                    threadId: 't',
                    agentUuid: 'ag',
                },
            ),
        );
        expect(screen.getByText('thread area')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
    describe('focus', () => {
        const noop = () => {};
        const draw = (bubble: Bubble, passthrough: boolean) => (
            <DesignBubble
                bubble={bubble}
                position={{ x: 0, y: 0 }}
                passthrough={passthrough}
                listening={false}
                onSend={noop}
                onStop={noop}
                onDiscard={noop}
                onClose={noop}
            >
                {null}
            </DesignBubble>
        );
        const oneMark = (): Bubble =>
            hold('text', 0).reduce(designSessionReducer, {
                bubbles: [],
                active: { kind: 'page' },
            }).bubbles[0];

        it('a hold that made no mark leaves focus where it was', () => {
            const elsewhere = document.createElement('input');
            document.body.append(elsewhere);
            try {
                const bubble = oneMark();
                const { rerender } = renderWithProviders(draw(bubble, false));
                expect(screen.getByLabelText('Message')).toHaveFocus();

                elsewhere.focus();
                rerender(draw(bubble, true));
                rerender(draw(bubble, false));
                expect(elsewhere).toHaveFocus();
            } finally {
                elsewhere.remove();
            }
        });

        it('a new mark brings focus back to the text box', () => {
            const elsewhere = document.createElement('input');
            document.body.append(elsewhere);
            try {
                const { rerender } = renderWithProviders(
                    draw(oneMark(), false),
                );
                elsewhere.focus();
                rerender(draw(oneMark(), true));
                // The mark lands while the hold is still down.
                rerender(draw(bubbleWith('text'), true));
                expect(elsewhere).toHaveFocus();
                rerender(draw(bubbleWith('text'), false));
                expect(screen.getByLabelText('Message')).toHaveFocus();
            } finally {
                elsewhere.remove();
            }
        });
    });
});
