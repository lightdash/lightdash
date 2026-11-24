import { assertUnreachable } from '@lightdash/common';
import { nextBubbleColor } from './bubblePalette';
import {
    captureReducer,
    type CaptureState,
    type ShiftUpAction,
} from './captureReducer';
import { type CaptureMark, type MarkKind, type Stroke } from './types';

export type BubbleInput = 'text' | 'mic';
// tabUuids[i] is the dashboard tab of image slot i.
export type Collection = {
    capture: CaptureState;
    tabUuids: (string | null)[];
};
export type Bubble = {
    id: string;
    homeTabUuid: string | null;
    /** Content coordinates. */
    anchor: { x: number; y: number };
    status: 'collecting' | 'queued' | 'picking-agent' | 'sending' | 'thread';
    input: BubbleInput;
    /** Marks being collected (first send or reply). */
    collection: Collection | null;
    /** Marks already sent, kept on screen. */
    sentMarks: CaptureMark[];
    threadId: string | null;
    agentUuid: string | null;
    /** Its place in the bubble palette: its marks, chips and pill take this colour. */
    color: number;
    /** Shown as a small pill; its marks stay on the page. */
    minimised: boolean;
    /** A reply was asked for and the bubble has not been open since. */
    unread: boolean;
    /** Its last reply could not be sent and waits, unsent, to be tried again. */
    sendFailed: boolean;
};
export type DesignSession = {
    bubbles: Bubble[];
    active: { kind: 'page' } | { kind: 'bubble'; bubbleId: string };
};

export type DesignAction =
    | {
          type: 'holdStarted';
          kind: MarkKind;
          atMs: number;
          tabUuid: string | null;
          isNewScreen: boolean;
          newBubble: { id: string; input: BubbleInput };
      }
    | { type: 'strokeAdded'; stroke: Stroke }
    | {
          type: 'holdEnded';
          atMs: number;
          mark: Omit<ShiftUpAction, 'type' | 'atMs'>;
          anchor: { x: number; y: number };
      }
    | { type: 'moved'; bubbleId: string; anchor: { x: number; y: number } }
    | { type: 'arm'; bubbleId: string; input: BubbleInput }
    | { type: 'inputChanged'; bubbleId: string; input: BubbleInput }
    | { type: 'queue'; bubbleId: string }
    | {
          type: 'sendStarted';
          bubbleId: string;
          needsPicker: boolean;
          /** The bubble gets out of the way while the agent works. */
          minimise: boolean;
      }
    | { type: 'minimise'; bubbleId: string }
    | { type: 'expand'; bubbleId: string }
    // The agent picker opened or closed in a bubble that is being sent.
    | { type: 'picking'; bubbleId: string; open: boolean }
    | {
          type: 'threadReady';
          bubbleId: string;
          threadId: string;
          agentUuid: string;
      }
    | { type: 'sendFailed'; bubbleId: string }
    /** A bubble on its way out frees the page for the next one. */
    | { type: 'handOff'; bubbleId: string }
    /** A bubble that was not sent after all takes marks again, if the page is free. */
    | { type: 'handBack'; bubbleId: string }
    | { type: 'discard'; bubbleId: string }
    | { type: 'close'; bubbleId: string };

const PAGE = { kind: 'page' } as const;
// A bubble that is open has been seen.
const OPEN = { minimised: false, unread: false, sendFailed: false } as const;

const collectedMarks = (c: Collection | null): CaptureMark[] =>
    c && c.capture.status === 'recording' ? c.capture.marks : [];

/** Something has been marked, or a mark is being drawn. */
export const isInProgress = (c: Collection | null): boolean =>
    c !== null &&
    c.capture.status === 'recording' &&
    (c.capture.marks.length > 0 || c.capture.drawing !== null);

const freshCollection = (input: BubbleInput): Collection => ({
    capture: captureReducer(
        { status: 'idle' },
        { type: 'started', voice: input === 'mic' ? 'on' : 'off' },
    ),
    tabUuids: [],
});

const activeBubbleId = (s: DesignSession): string | null =>
    s.active.kind === 'bubble' ? s.active.bubbleId : null;

const updateBubble = (
    s: DesignSession,
    id: string,
    fn: (b: Bubble) => Bubble,
): DesignSession => ({
    ...s,
    bubbles: s.bubbles.map((b) => (b.id === id ? fn(b) : b)),
});

/** A sent bubble can be a pill, unless marks are being collected in it. */
export const canMinimise = (b: Bubble): boolean =>
    b.status === 'sending' ||
    (b.status === 'thread' && !isInProgress(b.collection));

export const nextMarkNumber = (b: Bubble): number =>
    b.sentMarks.length + collectedMarks(b.collection).length + 1;

export const canStartHold = (s: DesignSession): boolean => {
    if (s.active.kind === 'page') return true;
    const { bubbleId } = s.active;
    const bubble = s.bubbles.find((b) => b.id === bubbleId);
    return (
        !!bubble &&
        bubble.collection !== null &&
        (bubble.status === 'collecting' || bubble.status === 'thread')
    );
};

export const activeCollection = (
    s: DesignSession,
): { bubble: Bubble; collection: Collection } | null => {
    const id = activeBubbleId(s);
    const bubble = s.bubbles.find((b) => b.id === id);
    if (!bubble || !bubble.collection) return null;
    return { bubble, collection: bubble.collection };
};

export const visibleBubbles = (
    s: DesignSession,
    tabUuid: string | null,
): Bubble[] =>
    s.bubbles.filter(
        (b) =>
            b.status !== 'thread' ||
            b.homeTabUuid === tabUuid ||
            // A reply being collected or sent follows the user, like an unsent bubble.
            b.collection !== null,
    );

/** What stays on the page when Design Mode is left: sent conversations, without unsent work. */
export const keepSent = (s: DesignSession): DesignSession => ({
    bubbles: s.bubbles.flatMap((b) => {
        if (!b.threadId) return [];
        // A reply already on its way out is left to finish.
        return [b.status === 'thread' ? { ...b, collection: null } : b];
    }),
    active: PAGE,
});

export const designSessionReducer = (
    s: DesignSession,
    action: DesignAction,
): DesignSession => {
    switch (action.type) {
        case 'holdStarted': {
            let session = s;
            if (s.active.kind === 'page') {
                const bubble: Bubble = {
                    id: action.newBubble.id,
                    homeTabUuid: action.tabUuid,
                    anchor: { x: 0, y: 0 },
                    status: 'collecting',
                    input: action.newBubble.input,
                    collection: freshCollection(action.newBubble.input),
                    sentMarks: [],
                    threadId: null,
                    agentUuid: null,
                    color: nextBubbleColor(
                        s.bubbles.at(-1)?.color ?? null,
                        s.bubbles.map((b) => b.color),
                    ),
                    minimised: false,
                    unread: false,
                    sendFailed: false,
                };
                session = {
                    bubbles: [...s.bubbles, bubble],
                    active: { kind: 'bubble', bubbleId: bubble.id },
                };
            }
            const id = activeBubbleId(session);
            if (!id || !canStartHold(session)) return s;
            return updateBubble(session, id, (b) => {
                if (!b.collection) return b;
                const capture = captureReducer(b.collection.capture, {
                    type: 'shiftDown',
                    atMs: action.atMs,
                    isNewScreen: action.isNewScreen,
                    kind: action.kind,
                });
                const slot =
                    capture.status === 'recording' && capture.drawing
                        ? capture.drawing.imageIndex
                        : null;
                const tabUuids = [...b.collection.tabUuids];
                if (slot !== null && slot >= tabUuids.length) {
                    tabUuids[slot] = action.tabUuid;
                }
                // What is being marked into is on show.
                return {
                    ...b,
                    minimised: false,
                    collection: { capture, tabUuids },
                };
            });
        }
        case 'strokeAdded': {
            const id = activeBubbleId(s);
            if (!id) return s;
            return updateBubble(s, id, (b) =>
                b.collection
                    ? {
                          ...b,
                          collection: {
                              ...b.collection,
                              capture: captureReducer(b.collection.capture, {
                                  type: 'strokeAdded',
                                  stroke: action.stroke,
                              }),
                          },
                      }
                    : b,
            );
        }
        case 'holdEnded': {
            const id = activeBubbleId(s);
            if (!id) return s;
            return updateBubble(s, id, (b) => {
                if (!b.collection) return b;
                const hadMarks = collectedMarks(b.collection).length > 0;
                const next = captureReducer(b.collection.capture, {
                    type: 'shiftUp',
                    atMs: action.atMs,
                    ...action.mark,
                });
                // Number marks after those already sent.
                const capture: CaptureState =
                    next.status === 'recording'
                        ? {
                              ...next,
                              marks: next.marks.map((m, i) => ({
                                  ...m,
                                  number: b.sentMarks.length + i + 1,
                              })),
                          }
                        : next;
                const gainedFirstMark =
                    !hadMarks &&
                    capture.status === 'recording' &&
                    capture.marks.length > 0;
                return {
                    ...b,
                    anchor:
                        gainedFirstMark && b.sentMarks.length === 0
                            ? action.anchor
                            : b.anchor,
                    collection: { ...b.collection, capture },
                };
            });
        }
        case 'moved':
            return updateBubble(s, action.bubbleId, (b) => ({
                ...b,
                anchor: action.anchor,
            }));
        case 'arm': {
            const target = s.bubbles.find((b) => b.id === action.bubbleId);
            if (!target || target.status !== 'thread') return s;
            const blocked = s.bubbles.some(
                (b) =>
                    b.id !== target.id &&
                    (b.status === 'collecting' || b.status === 'thread') &&
                    isInProgress(b.collection),
            );
            if (blocked) return s;
            // Drop other bubbles' empty collections so only one target stays open.
            const bubbles = s.bubbles
                .filter(
                    (b) =>
                        b.id === target.id ||
                        !(b.status === 'collecting' && b.collection),
                )
                .map((b) => {
                    if (b.id === target.id) {
                        return {
                            ...b,
                            ...OPEN,
                            input: action.input,
                            // Marks already made are kept; an empty one restarts for this input.
                            collection:
                                b.collection && isInProgress(b.collection)
                                    ? b.collection
                                    : freshCollection(action.input),
                        };
                    }
                    return b.status === 'thread'
                        ? { ...b, collection: null }
                        : b;
                });
            return {
                bubbles,
                active: { kind: 'bubble', bubbleId: target.id },
            };
        }
        case 'inputChanged':
            return updateBubble(s, action.bubbleId, (b) => ({
                ...b,
                input: action.input,
            }));
        case 'queue': {
            const bubble = s.bubbles.find((b) => b.id === action.bubbleId);
            // Sending too: a surface that bundles answers a send by queueing it.
            if (
                !bubble ||
                (bubble.status !== 'collecting' && bubble.status !== 'sending')
            ) {
                return s;
            }
            const next = updateBubble(s, bubble.id, (b) => ({
                ...b,
                ...OPEN,
                status: 'queued',
            }));
            return activeBubbleId(s) === bubble.id
                ? { ...next, active: PAGE }
                : next;
        }
        case 'sendStarted': {
            const next = updateBubble(s, action.bubbleId, (b) =>
                b.collection &&
                (b.status === 'collecting' || b.status === 'thread')
                    ? {
                          ...b,
                          status: action.needsPicker
                              ? 'picking-agent'
                              : 'sending',
                          minimised: action.minimise && !action.needsPicker,
                          unread: action.minimise,
                          sendFailed: false,
                      }
                    : b,
            );
            // The page takes the next marks while this one is sent.
            return next !== s && activeBubbleId(s) === action.bubbleId
                ? { ...next, active: PAGE }
                : next;
        }
        case 'handOff':
            return activeBubbleId(s) === action.bubbleId
                ? { ...s, active: PAGE }
                : s;
        case 'handBack': {
            const bubble = s.bubbles.find((b) => b.id === action.bubbleId);
            return s.active.kind === 'page' &&
                bubble?.status === 'collecting' &&
                bubble.collection
                ? { ...s, active: { kind: 'bubble', bubbleId: bubble.id } }
                : s;
        }
        case 'minimise': {
            const bubble = s.bubbles.find((b) => b.id === action.bubbleId);
            if (!bubble || !canMinimise(bubble)) return s;
            // An empty reply being collected goes: nothing marks into a pill.
            const next = updateBubble(s, bubble.id, (b) => ({
                ...b,
                minimised: true,
                collection: b.status === 'thread' ? null : b.collection,
            }));
            return bubble.status === 'thread' && activeBubbleId(s) === bubble.id
                ? { ...next, active: PAGE }
                : next;
        }
        case 'expand':
            return updateBubble(s, action.bubbleId, (b) => ({ ...b, ...OPEN }));
        case 'picking':
            return updateBubble(s, action.bubbleId, (b) =>
                b.status === (action.open ? 'sending' : 'picking-agent')
                    ? {
                          ...b,
                          status: action.open ? 'picking-agent' : 'sending',
                          // The picker has to be seen; once picked, the bubble
                          // minimises unless the user opened it themselves.
                          minimised: !action.open && b.unread,
                      }
                    : b,
            );
        case 'threadReady': {
            const next = updateBubble(s, action.bubbleId, (b) => ({
                ...b,
                status: 'thread',
                sentMarks: [...b.sentMarks, ...collectedMarks(b.collection)],
                collection: null,
                threadId: action.threadId,
                agentUuid: action.agentUuid,
            }));
            return activeBubbleId(s) === action.bubbleId
                ? { ...next, active: PAGE }
                : next;
        }
        case 'sendFailed': {
            const next = updateBubble(s, action.bubbleId, (b) =>
                b.status === 'picking-agent' || b.status === 'sending'
                    ? b.threadId
                        ? { ...b, status: 'thread', sendFailed: true }
                        : // An unsent bubble is open, to be sent again.
                          { ...b, ...OPEN, status: 'collecting' }
                    : b,
            );
            return designSessionReducer(next, {
                type: 'handBack',
                bubbleId: action.bubbleId,
            });
        }
        case 'discard': {
            const bubble = s.bubbles.find((b) => b.id === action.bubbleId);
            if (!bubble) return s;
            if (bubble.status === 'thread') {
                // Throws away an unsent reply, keeps the thread.
                const next = updateBubble(s, bubble.id, (b) => ({
                    ...b,
                    collection: null,
                    sendFailed: false,
                }));
                return activeBubbleId(s) === bubble.id
                    ? { ...next, active: PAGE }
                    : next;
            }
            return {
                bubbles: s.bubbles.filter((b) => b.id !== bubble.id),
                active: activeBubbleId(s) === bubble.id ? PAGE : s.active,
            };
        }
        case 'close':
            return {
                bubbles: s.bubbles.filter((b) => b.id !== action.bubbleId),
                active: activeBubbleId(s) === action.bubbleId ? PAGE : s.active,
            };
        default:
            return assertUnreachable(action, 'Unknown design action');
    }
};
