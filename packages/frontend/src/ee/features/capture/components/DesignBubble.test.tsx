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
        onRaise: vi.fn(),
        onMove: vi.fn(),
        onMinimise: vi.fn(),
        onExpand: vi.fn(),
    };
    renderWithProviders(
        <DesignBubble
            bubble={bubble}
            position={{ x: 120, y: 80 }}
            scrollsWithPage={false}
            stack={2}
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

    it('shows a numbered chip for each collected mark', () => {
        setup(bubbleWith('text'));
        expect(screen.getByLabelText('Mark 1')).toHaveTextContent('1');
        expect(screen.getByLabelText('Mark 2')).toHaveTextContent('2');
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
                minimise: false,
            }),
        );
        expect(screen.getByText('thread area')).toBeInTheDocument();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('a sent bubble shows its thread and closes', () => {
        const { onClose } = setup(
            bubbleWith(
                'text',
                {
                    type: 'sendStarted',
                    bubbleId: 'a',
                    needsPicker: false,
                    minimise: false,
                },
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
    describe('moving and stacking', () => {
        const root = () =>
            document.querySelector('[data-bubble-id="a"]') as HTMLElement;
        const header = () => screen.getByLabelText('Mark 1').parentElement!;

        it('is dragged by its header to where it is dropped', () => {
            const { onMove, onSend } = setup(bubbleWith('text'));
            // Where the bubble is on screen when the drag starts.
            vi.spyOn(root(), 'getBoundingClientRect').mockReturnValue(
                new DOMRect(120, 80, 300, 120),
            );
            const kept = fireEvent.mouseDown(header(), {
                clientX: 200,
                clientY: 100,
            });
            // No text selection starts, and the text box keeps its focus.
            expect(kept).toBe(false);
            fireEvent.mouseMove(window, { clientX: 230, clientY: 140 });
            expect(onMove).toHaveBeenLastCalledWith({ x: 150, y: 120 });
            expect(root()).toHaveAttribute('data-dragging', 'true');
            fireEvent.mouseUp(window);
            fireEvent.mouseMove(window, { clientX: 400, clientY: 400 });
            expect(onMove).toHaveBeenCalledTimes(1);
            expect(root()).toHaveAttribute('data-dragging', 'false');
            expect(onSend).not.toHaveBeenCalled();
        });

        it('a press that barely moves is not a drag', () => {
            const { onMove } = setup(bubbleWith('text'));
            fireEvent.mouseDown(header(), { clientX: 200, clientY: 100 });
            fireEvent.mouseMove(window, { clientX: 201, clientY: 101 });
            fireEvent.mouseUp(window);
            expect(onMove).not.toHaveBeenCalled();
        });

        it('its close button and its body do not drag it', () => {
            const { onMove, onDiscard } = setup(bubbleWith('text'));
            const close = screen.getByRole('button', { name: 'Discard' });
            fireEvent.mouseDown(close, { clientX: 200, clientY: 100 });
            fireEvent.mouseMove(window, { clientX: 260, clientY: 160 });
            fireEvent.mouseUp(window);
            fireEvent.mouseDown(screen.getByRole('textbox'), {
                clientX: 200,
                clientY: 100,
            });
            fireEvent.mouseMove(window, { clientX: 260, clientY: 160 });
            fireEvent.mouseUp(window);
            expect(onMove).not.toHaveBeenCalled();
            fireEvent.click(close);
            expect(onDiscard).toHaveBeenCalledTimes(1);
        });

        it('does not move while a hold is down', () => {
            const { onMove } = setup(bubbleWith('text'), { passthrough: true });
            fireEvent.mouseDown(header(), { clientX: 200, clientY: 100 });
            fireEvent.mouseMove(window, { clientX: 260, clientY: 160 });
            expect(onMove).not.toHaveBeenCalled();
        });

        it('a press or focus anywhere in it brings it to the front', () => {
            const { onRaise } = setup(bubbleWith('text'));
            // Opening focuses its text box, which raised it once already.
            onRaise.mockClear();
            fireEvent.mouseDown(screen.getByRole('textbox'));
            expect(onRaise).toHaveBeenCalledTimes(1);
            fireEvent.focus(screen.getByRole('button', { name: 'Discard' }));
            expect(onRaise).toHaveBeenCalledTimes(2);
        });

        it('takes its place in the stack', () => {
            setup(bubbleWith('text'));
            expect(root().style.getPropertyValue('--bubble-stack')).toBe('2');
        });
    });

    describe('focus', () => {
        const noop = () => {};
        const draw = (bubble: Bubble, passthrough: boolean) => (
            <DesignBubble
                bubble={bubble}
                position={{ x: 0, y: 0 }}
                scrollsWithPage={false}
                stack={0}
                passthrough={passthrough}
                listening={false}
                onRaise={noop}
                onMove={noop}
                onSend={noop}
                onStop={noop}
                onDiscard={noop}
                onClose={noop}
                onMinimise={noop}
                onExpand={noop}
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

    describe('minimise', () => {
        const threadReady: DesignAction = {
            type: 'threadReady',
            bubbleId: 'a',
            threadId: 't',
            agentUuid: 'agent',
        };
        const sendStarted = (minimise: boolean): DesignAction => ({
            type: 'sendStarted',
            bubbleId: 'a',
            needsPicker: false,
            minimise,
        });

        it('a conversation has Minimise next to Close', () => {
            const { onMinimise, onClose } = setup(
                bubbleWith('text', sendStarted(false), threadReady),
            );
            fireEvent.click(screen.getByRole('button', { name: 'Minimise' }));
            expect(onMinimise).toHaveBeenCalledTimes(1);
            expect(onClose).not.toHaveBeenCalled();
            expect(
                screen.getByRole('button', { name: 'Close' }),
            ).toBeInTheDocument();
        });

        it('a bubble being sent can be minimised', () => {
            setup(bubbleWith('text', sendStarted(false)));
            expect(
                screen.getByRole('button', { name: 'Minimise' }),
            ).toBeInTheDocument();
        });

        it.each([
            ['unsent', []],
            [
                'picking an agent',
                [{ ...sendStarted(false), needsPicker: true }],
            ],
            ['queued', [{ type: 'queue', bubbleId: 'a' }]],
        ] as [string, DesignAction[]][])(
            'a bubble that is %s has no Minimise',
            (_, actions) => {
                setup(bubbleWith('text', ...actions));
                expect(
                    screen.queryByRole('button', { name: 'Minimise' }),
                ).toBeNull();
            },
        );

        it('a bubble collecting a reply has no Minimise', () => {
            setup(
                bubbleWith(
                    'text',
                    sendStarted(false),
                    threadReady,
                    { type: 'arm', bubbleId: 'a', input: 'text' },
                    ...hold('text', 5000),
                ),
            );
            expect(
                screen.queryByRole('button', { name: 'Minimise' }),
            ).toBeNull();
        });

        it('minimised while it is sent, it is a Working pill that expands', () => {
            const { onExpand } = setup(bubbleWith('text', sendStarted(true)));
            const pill = screen.getByRole('button', {
                name: 'Expand: Working',
            });
            expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
            expect(screen.queryByText('Sending')).toBeNull();
            fireEvent.click(pill);
            expect(onExpand).toHaveBeenCalledTimes(1);
        });

        it('a minimised conversation shows only what its host draws', () => {
            const { container } = (() => {
                const bubble = bubbleWith(
                    'text',
                    sendStarted(true),
                    threadReady,
                );
                setup(bubble);
                return { container: document.body };
            })();
            expect(screen.getByText('thread area')).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
            expect(
                screen.queryByRole('button', { name: 'Minimise' }),
            ).toBeNull();
            expect(
                container.querySelector('[data-bubble-id="a"]'),
            ).toHaveAttribute('data-minimised', 'true');
        });

        it('a pill dragged is not pressed', () => {
            const { onExpand, onMove } = setup(
                bubbleWith('text', sendStarted(true)),
            );
            const pill = screen.getByRole('button', {
                name: 'Expand: Working',
            });
            fireEvent.mouseDown(pill, { button: 0, clientX: 10, clientY: 10 });
            fireEvent.mouseMove(window, { clientX: 60, clientY: 40 });
            fireEvent.mouseUp(window);
            fireEvent.click(pill);
            expect(onMove).toHaveBeenCalled();
            expect(onExpand).not.toHaveBeenCalled();
            // The next press is a press again.
            fireEvent.click(pill);
            expect(onExpand).toHaveBeenCalledTimes(1);
        });

        it('opened from its pill, focus goes to Minimise', () => {
            const sent = bubbleWith('text', sendStarted(true), threadReady);
            const props = {
                position: { x: 0, y: 0 },
                scrollsWithPage: false,
                stack: 0,
                passthrough: false,
                listening: false,
                onRaise: vi.fn(),
                onMove: vi.fn(),
                onSend: vi.fn(),
                onStop: vi.fn(),
                onDiscard: vi.fn(),
                onClose: vi.fn(),
                onMinimise: vi.fn(),
                onExpand: vi.fn(),
            };
            const { rerender } = renderWithProviders(
                <DesignBubble bubble={sent} {...props}>
                    <button type="button" data-bubble-pill="">
                        pill
                    </button>
                </DesignBubble>,
            );
            fireEvent.click(screen.getByRole('button', { name: 'pill' }));
            rerender(
                <DesignBubble bubble={{ ...sent, minimised: false }} {...props}>
                    <span>thread</span>
                </DesignBubble>,
            );
            expect(
                screen.getByRole('button', { name: 'Minimise' }),
            ).toHaveFocus();
        });

        it('takes its colour from the bubble', () => {
            setup(bubbleWith('text'));
            const root = document.querySelector<HTMLElement>(
                '[data-bubble-id="a"]',
            )!;
            expect(root.style.getPropertyValue('--bubble-color')).toBe(
                '#e03131',
            );
        });
    });
});
