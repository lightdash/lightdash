import { describe, expect, it } from 'vitest';
import {
    activeCollection,
    canStartHold,
    designSessionReducer,
    keepSent,
    nextMarkNumber,
    visibleBubbles,
    type DesignAction,
    type DesignSession,
} from './designSession';

const empty: DesignSession = { bubbles: [], active: { kind: 'page' } };

const stroke = {
    points: [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.5 },
    ],
};
const mark = {
    target: null,
    arrowTo: null,
    trail: [],
    covers: [],
    tabName: null,
    box: null,
};

const run = (s: DesignSession, ...actions: DesignAction[]) =>
    actions.reduce(designSessionReducer, s);

const hold = (
    id: string,
    at: number,
    tabUuid: string | null = null,
    isNewScreen = false,
): DesignAction[] => [
    {
        type: 'holdStarted',
        tool: 'stylus',
        atMs: at,
        tabUuid,
        isNewScreen,
        newBubble: { id, input: 'text' },
    },
    { type: 'strokeAdded', stroke },
    {
        type: 'holdEnded',
        atMs: at + 100,
        mark,
        anchor: { x: 10, y: 20 },
    },
];

const sendAndFinish = (s: DesignSession, id: string) =>
    run(
        s,
        { type: 'sendStarted', bubbleId: id, needsPicker: false },
        { type: 'threadReady', bubbleId: id, threadId: 't', agentUuid: 'a' },
    );

describe('designSessionReducer', () => {
    it('the first hold on the page opens a collecting bubble and makes it active', () => {
        const s = run(empty, ...hold('a', 0, 'tab1'));
        expect(s.bubbles).toHaveLength(1);
        expect(s.bubbles[0]).toMatchObject({
            id: 'a',
            status: 'collecting',
            homeTabUuid: 'tab1',
            anchor: { x: 10, y: 20 },
        });
        expect(s.active).toEqual({ kind: 'bubble', bubbleId: 'a' });
    });

    it('moved puts the bubble at its new anchor', () => {
        const s = run(empty, ...hold('a', 0), {
            type: 'moved',
            bubbleId: 'a',
            anchor: { x: 300, y: 40 },
        });
        expect(s.bubbles[0].anchor).toEqual({ x: 300, y: 40 });
        expect(s.active).toEqual({ kind: 'bubble', bubbleId: 'a' });
    });

    it('later holds add numbered marks to the open bubble', () => {
        const s = run(
            empty,
            ...hold('a', 0),
            ...hold('b', 1000),
            ...hold('c', 2000),
        );
        expect(s.bubbles).toHaveLength(1);
        const marks = s.bubbles[0].collection?.capture;
        expect(
            marks?.status === 'recording' && marks.marks.map((m) => m.number),
        ).toEqual([1, 2, 3]);
        expect(nextMarkNumber(s.bubbles[0])).toBe(4);
    });

    it('a sent bubble that is armed numbers its reply marks after the sent ones', () => {
        let s = run(
            empty,
            ...hold('a', 0),
            ...hold('a', 1000),
            ...hold('a', 2000),
        );
        s = sendAndFinish(s, 'a');
        expect(s.bubbles[0].sentMarks).toHaveLength(3);
        expect(s.active).toEqual({ kind: 'page' });
        s = run(s, { type: 'arm', bubbleId: 'a', input: 'mic' });
        expect(s.active).toEqual({ kind: 'bubble', bubbleId: 'a' });
        expect(s.bubbles[0].input).toBe('mic');
        s = run(s, ...hold('x', 5000));
        const c = activeCollection(s);
        expect(
            c?.collection.capture.status === 'recording' &&
                c.collection.capture.marks[0].number,
        ).toBe(4);
        s = sendAndFinish(s, 'a');
        expect(s.bubbles[0].sentMarks.map((m) => m.number)).toEqual([
            1, 2, 3, 4,
        ]);
        expect(s.bubbles[0].status).toBe('thread');
    });

    it('only one target is active', () => {
        let s = run(empty, ...hold('a', 0));
        s = sendAndFinish(s, 'a');
        s = run(s, ...hold('b', 1000));
        expect(s.bubbles).toHaveLength(2);
        const before = s;
        expect(
            designSessionReducer(s, {
                type: 'arm',
                bubbleId: 'a',
                input: 'text',
            }),
        ).toEqual(before);
        s = sendAndFinish(s, 'b');
        expect(s.active).toEqual({ kind: 'page' });
        s = run(s, { type: 'arm', bubbleId: 'b', input: 'text' });
        expect(s.active).toEqual({ kind: 'bubble', bubbleId: 'b' });
    });

    it('marks on a second tab open a new image slot', () => {
        const s = run(
            empty,
            ...hold('a', 0, 'a'),
            ...hold('a', 1000, 'b', true),
        );
        expect(s.bubbles[0].collection?.tabUuids).toEqual(['a', 'b']);
        const slots = (session: DesignSession) => {
            const capture = session.bubbles[0].collection?.capture;
            return capture?.status === 'recording'
                ? capture.marks.map((m) => m.imageIndex)
                : [];
        };
        // The mark already on tab a keeps its image slot.
        expect(slots(s)).toEqual([0, 1]);
        const same = run(s, ...hold('a', 2000, 'b', false));
        expect(same.bubbles[0].collection?.tabUuids).toEqual(['a', 'b']);
        expect(slots(same)).toEqual([0, 1, 1]);
    });

    it('visibleBubbles shows sent bubbles on their home tab only, and the collecting bubble on every tab', () => {
        let s = run(empty, ...hold('a', 0, 'tab1'));
        s = sendAndFinish(s, 'a');
        s = run(s, ...hold('b', 1000, 'tab2'));
        expect(visibleBubbles(s, 'tab1').map((b) => b.id)).toEqual(['a', 'b']);
        expect(visibleBubbles(s, 'tab2').map((b) => b.id)).toEqual(['b']);
    });

    it('an armed reply follows the user to another tab', () => {
        let s = run(empty, ...hold('a', 0, 'tab1'));
        s = sendAndFinish(s, 'a');
        expect(visibleBubbles(s, 'tab2')).toEqual([]);
        s = run(s, { type: 'arm', bubbleId: 'a', input: 'mic' });
        expect(visibleBubbles(s, 'tab2').map((b) => b.id)).toEqual(['a']);
        s = run(s, ...hold('a', 1000, 'tab2', true));
        expect(visibleBubbles(s, 'tab2').map((b) => b.id)).toEqual(['a']);
        // Sent or thrown away, it lives on its home tab again.
        expect(
            visibleBubbles(run(s, { type: 'discard', bubbleId: 'a' }), 'tab2'),
        ).toEqual([]);
        expect(visibleBubbles(sendAndFinish(s, 'a'), 'tab2')).toEqual([]);
        expect(visibleBubbles(sendAndFinish(s, 'a'), 'tab1')).toHaveLength(1);
    });

    it('keepSent keeps sent conversations and drops everything unsent', () => {
        let s = run(empty, ...hold('a', 0));
        s = sendAndFinish(s, 'a');
        s = run(s, ...hold('b', 1000));
        s = sendAndFinish(s, 'b');
        s = run(
            s,
            { type: 'arm', bubbleId: 'a', input: 'text' },
            ...hold('a', 2000),
        );
        // b's reply is on its way out; c was never sent; q waits in a bundle.
        const sending = {
            ...s.bubbles[1],
            status: 'sending' as const,
            collection: s.bubbles[0].collection,
        };
        const never = { ...s.bubbles[0], id: 'c', threadId: null };
        const queued = { ...never, id: 'q', status: 'queued' as const };
        const kept = keepSent({
            ...s,
            bubbles: [s.bubbles[0], sending, never, queued],
        });
        expect(kept.active).toEqual({ kind: 'page' });
        expect(kept.bubbles.map((b) => b.id)).toEqual(['a', 'b']);
        expect(kept.bubbles[0]).toMatchObject({
            status: 'thread',
            collection: null,
        });
        expect(kept.bubbles[0].sentMarks).toHaveLength(1);
        expect(kept.bubbles[1]).toBe(sending);
    });

    it('discard removes an unsent bubble; close removes a sent bubble', () => {
        let s = run(empty, ...hold('a', 0));
        expect(run(s, { type: 'discard', bubbleId: 'a' })).toEqual(empty);
        s = sendAndFinish(s, 'a');
        expect(run(s, { type: 'close', bubbleId: 'a' })).toEqual(empty);
    });

    it('sendFailed returns the bubble to collecting with its marks', () => {
        let s = run(empty, ...hold('a', 0));
        s = run(s, { type: 'sendStarted', bubbleId: 'a', needsPicker: true });
        expect(s.bubbles[0].status).toBe('picking-agent');
        s = run(s, { type: 'sendFailed', bubbleId: 'a' });
        expect(s.bubbles[0].status).toBe('collecting');
        expect(s.bubbles[0].collection).not.toBeNull();
        s = run(s, { type: 'sendStarted', bubbleId: 'a', needsPicker: false });
        expect(s.bubbles[0].status).toBe('sending');
    });

    it('picking moves a sending bubble to the agent picker and back', () => {
        let s = run(empty, ...hold('a', 0));
        s = run(s, { type: 'picking', bubbleId: 'a', open: true });
        expect(s.bubbles[0].status).toBe('collecting');
        s = run(s, { type: 'sendStarted', bubbleId: 'a', needsPicker: false });
        s = run(s, { type: 'picking', bubbleId: 'a', open: true });
        expect(s.bubbles[0].status).toBe('picking-agent');
        s = run(s, { type: 'picking', bubbleId: 'a', open: false });
        expect(s.bubbles[0].status).toBe('sending');
    });

    it('a queued bubble can be removed and is skipped by the active-target rule', () => {
        let s = run(empty, ...hold('a', 0));
        s = run(s, { type: 'queue', bubbleId: 'a' });
        expect(s.bubbles[0].status).toBe('queued');
        expect(s.active).toEqual({ kind: 'page' });
        expect(canStartHold(s)).toBe(true);
        expect(activeCollection(s)).toBeNull();
        expect(
            designSessionReducer(s, {
                type: 'arm',
                bubbleId: 'a',
                input: 'text',
            }),
        ).toEqual(s);
        s = run(s, ...hold('b', 1000));
        expect(s.bubbles).toHaveLength(2);
        expect(
            run(s, { type: 'discard', bubbleId: 'a' }).bubbles.map((b) => b.id),
        ).toEqual(['b']);
    });

    it('arming a thread bubble drops the empty collection of another bubble', () => {
        let s = run(empty, ...hold('a', 0));
        s = sendAndFinish(s, 'a');
        s = run(s, ...hold('b', 1000));
        s = sendAndFinish(s, 'b');
        // b is armed but nothing is marked yet, so a can take over.
        s = run(s, { type: 'arm', bubbleId: 'b', input: 'text' });
        expect(s.bubbles[1].collection).not.toBeNull();
        s = run(s, { type: 'arm', bubbleId: 'a', input: 'text' });
        expect(s.active).toEqual({ kind: 'bubble', bubbleId: 'a' });
        expect(s.bubbles[1]).toMatchObject({
            status: 'thread',
            collection: null,
        });
    });

    it('arming again with nothing marked starts the collection afresh for the new input', () => {
        let s = run(empty, ...hold('a', 0));
        s = sendAndFinish(s, 'a');
        s = run(s, { type: 'arm', bubbleId: 'a', input: 'text' });
        s = run(s, { type: 'arm', bubbleId: 'a', input: 'mic' });
        const capture = s.bubbles[0].collection?.capture;
        expect(capture?.status === 'recording' && capture.voice).toBe('on');
        // Marks already made are kept when the input changes.
        s = run(s, ...hold('x', 5000));
        s = run(s, { type: 'arm', bubbleId: 'a', input: 'text' });
        expect(nextMarkNumber(s.bubbles[0])).toBe(3);
    });

    it('a failed reply returns the bubble to its thread with the reply marks', () => {
        let s = run(empty, ...hold('a', 0));
        s = sendAndFinish(s, 'a');
        s = run(
            s,
            { type: 'arm', bubbleId: 'a', input: 'text' },
            ...hold('x', 5000),
            { type: 'sendStarted', bubbleId: 'a', needsPicker: false },
            { type: 'sendFailed', bubbleId: 'a' },
        );
        expect(s.bubbles[0].status).toBe('thread');
        expect(nextMarkNumber(s.bubbles[0])).toBe(3);
    });

    it('discarding a reply keeps the thread and frees the page', () => {
        let s = run(empty, ...hold('a', 0));
        s = sendAndFinish(s, 'a');
        s = run(
            s,
            { type: 'arm', bubbleId: 'a', input: 'text' },
            ...hold('x', 5000),
            { type: 'discard', bubbleId: 'a' },
        );
        expect(s.bubbles[0]).toMatchObject({
            status: 'thread',
            collection: null,
            threadId: 't',
        });
        expect(s.bubbles[0].sentMarks).toHaveLength(1);
        expect(s.active).toEqual({ kind: 'page' });
    });

    it('a bubble being sent can be queued, keeping its marks', () => {
        let s = run(empty, ...hold('a', 0), {
            type: 'sendStarted',
            bubbleId: 'a',
            needsPicker: false,
        });
        expect(s.bubbles[0].status).toBe('sending');
        s = run(s, { type: 'queue', bubbleId: 'a' });
        expect(s.bubbles[0].status).toBe('queued');
        expect(s.active).toEqual({ kind: 'page' });
        expect(nextMarkNumber(s.bubbles[0])).toBe(2);
        // The page is free again: the next hold opens a second bubble.
        s = run(s, ...hold('b', 1000));
        expect(s.bubbles.map((b) => b.id)).toEqual(['a', 'b']);
    });

    it('a queued bubble does not block arming a thread bubble', () => {
        let s = run(empty, ...hold('b', 0));
        s = sendAndFinish(s, 'b');
        s = run(s, ...hold('a', 1000), { type: 'queue', bubbleId: 'a' });
        s = run(s, { type: 'arm', bubbleId: 'b', input: 'text' });
        expect(s.active).toEqual({ kind: 'bubble', bubbleId: 'b' });
        expect(s.bubbles.find((b) => b.id === 'a')?.status).toBe('queued');
    });

    it('canStartHold is false while a bubble is sending', () => {
        let s = run(empty, ...hold('a', 0));
        expect(canStartHold(s)).toBe(true);
        s = run(s, { type: 'sendStarted', bubbleId: 'a', needsPicker: false });
        expect(canStartHold(s)).toBe(false);
    });

    it('inputChanged turns a mic bubble into a text box, keeping its marks', () => {
        const s = run(
            empty,
            ...hold('a', 0).map((a) =>
                a.type === 'holdStarted'
                    ? { ...a, newBubble: { id: 'a', input: 'mic' as const } }
                    : a,
            ),
            { type: 'inputChanged', bubbleId: 'a', input: 'text' },
        );
        expect(s.bubbles[0].input).toBe('text');
        expect(activeCollection(s)?.collection.capture).toMatchObject({
            marks: [{ number: 1 }],
        });
    });
});
