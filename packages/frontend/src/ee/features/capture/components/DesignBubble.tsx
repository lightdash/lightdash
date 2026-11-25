import { assertUnreachable } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Group,
    Loader,
    Paper,
    Text,
    Textarea,
} from '@mantine/core';
import { IconMicrophone, IconMinus, IconX } from '@tabler/icons-react';
import {
    useEffect,
    useRef,
    useState,
    type FC,
    type MouseEvent as ReactMouseEvent,
    type ReactNode,
} from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { BUBBLE_COLOR_VAR, bubbleColor } from '../bubblePalette';
import { BUBBLE_PILL_ATTRIBUTE } from '../bubblePill';
import {
    BUBBLE_DRAG_ATTRIBUTE,
    clampDrag,
    dragStartsOn,
    wheelScrollsInside,
} from '../bubblePointer';
import { canMinimise, type Bubble } from '../designSession';
import { CAPTURE_IGNORE_ATTRIBUTE } from '../frameSource';
import { DESIGN_INPUT_ATTRIBUTE } from '../holdKeys';
import BubblePill from './BubblePill';
import classes from './DesignBubble.module.css';

// A press on the header that moves less than this is a click.
const DRAG_START_PX = 3;
// Bubbles stay under modals and popovers however many there are.
const MAX_STACK = 60;

type Props = {
    bubble: Bubble;
    /** Top left, in content pixels. */
    position: { x: number; y: number };
    /** It sits in the page's own content, which the browser scrolls. */
    scrollsWithPage: boolean;
    /** Its place among the bubbles, 0 at the back. */
    stack: number;
    /** A hold is down: the bubble fades and lets the pointer through. */
    passthrough: boolean;
    /** The hold key is down and the mic is recording into this bubble. */
    listening: boolean;
    /** A sent bubble that the next hold marks into. */
    selected: boolean;
    /** The toolbar's mic: a hold on a selected bubble records. */
    micOn: boolean;
    /** Clicked: a sent bubble becomes the one the next hold marks into. */
    onSelect: () => void;
    /** Pressed or focused: it comes to the front. */
    onRaise: () => void;
    /** Dragged by its header to this top left, in viewport pixels. */
    onMove: (position: { x: number; y: number }) => void;
    onSend: (text: string) => void;
    onDiscard: () => void;
    onClose: () => void;
    onMinimise: () => void;
    onExpand: () => void;
    /**
     * The agent picker or the thread, once the bubble is sent. A minimised
     * conversation draws its own pill here.
     */
    children: ReactNode;
};

const DesignBubble: FC<Props> = ({
    bubble,
    position,
    scrollsWithPage,
    stack,
    passthrough,
    listening,
    selected,
    micOn,
    onSelect,
    onRaise,
    onMove,
    onSend,
    onDiscard,
    onClose,
    onMinimise,
    onExpand,
    children,
}) => {
    const color = bubbleColor(bubble.color);
    const { minimised } = bubble;
    const [text, setText] = useState('');
    const inputRef = useRef<HTMLTextAreaElement | null>(null);
    const collected =
        bubble.collection?.capture.status === 'recording'
            ? bubble.collection.capture.marks
            : [];
    const byMic = bubble.input === 'mic';
    const typing = bubble.status === 'collecting' && !byMic;

    // The text box takes focus when it appears and after each new mark, so
    // typing carries on. A hold that made no mark leaves focus where it was.
    const markCount = collected.length;
    const focusedAtMarks = useRef(0);
    useEffect(() => {
        if (!typing) {
            focusedAtMarks.current = 0;
            return;
        }
        if (passthrough || markCount <= focusedAtMarks.current) return;
        focusedAtMarks.current = markCount;
        inputRef.current?.focus({ preventScroll: true });
    }, [markCount, passthrough, typing]);

    const rootRef = useRef<HTMLDivElement | null>(null);
    const onMoveRef = useRef(onMove);
    onMoveRef.current = onMove;
    const [dragging, setDragging] = useState(false);
    const dragRef = useRef<{ end: () => void } | null>(null);
    // The click that ends a drag is not a press on what was dragged.
    const draggedRef = useRef(false);
    useEffect(() => () => dragRef.current?.end(), []);
    // The key hold marks the page: the bubble is let go of.
    useEffect(() => {
        if (passthrough) dragRef.current?.end();
    }, [passthrough]);

    const startDrag = (event: ReactMouseEvent<HTMLDivElement>) => {
        const root = rootRef.current;
        if (!root || passthrough || event.button !== 0) return;
        if (!(event.target instanceof Element)) return;
        if (!dragStartsOn(event.target, root)) return;
        // No text selection, and focus stays where the user was typing.
        event.preventDefault();
        dragRef.current?.end();
        draggedRef.current = false;
        const from = { x: event.clientX, y: event.clientY };
        const start = root.getBoundingClientRect();
        let moving = false;
        const move = (next: MouseEvent) => {
            const dx = next.clientX - from.x;
            const dy = next.clientY - from.y;
            if (!moving && Math.hypot(dx, dy) < DRAG_START_PX) return;
            if (!moving) setDragging(true);
            moving = true;
            draggedRef.current = true;
            onMoveRef.current(
                clampDrag(
                    { x: start.left + dx, y: start.top + dy },
                    start,
                    new DOMRect(0, 0, window.innerWidth, window.innerHeight),
                    scrollsWithPage,
                ),
            );
        };
        const end = () => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', end);
            dragRef.current = null;
            setDragging(false);
        };
        dragRef.current = { end };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', end);
    };

    // The wheel scrolls what is in the bubble and never the page under it.
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return undefined;
        const onWheel = (event: WheelEvent) => {
            if (event.ctrlKey || !(event.target instanceof Element)) return;
            const delta = { x: event.deltaX, y: event.deltaY };
            if (!wheelScrollsInside(event.target, root, delta)) {
                event.preventDefault();
            }
        };
        root.addEventListener('wheel', onWheel, { passive: false });
        return () => root.removeEventListener('wheel', onWheel);
    }, []);

    // Minimised or expanded from inside it, focus goes to what took its place.
    const toggledHereRef = useRef(false);
    useEffect(() => {
        if (!toggledHereRef.current) return;
        toggledHereRef.current = false;
        rootRef.current
            ?.querySelector<HTMLElement>(
                minimised
                    ? `[${BUBBLE_PILL_ATTRIBUTE}]`
                    : '[data-bubble-minimise]',
            )
            ?.focus({ preventScroll: true });
    }, [minimised]);

    const sendingRow = (
        <Group gap="xs" wrap="nowrap">
            <Loader size="xs" />
            <Text size="sm" c="dimmed">
                Sending
            </Text>
        </Group>
    );

    const listeningRow = (
        <Group gap={6} wrap="nowrap" className={classes.listening}>
            <MantineIcon icon={IconMicrophone} color="red" />
            <Text size="sm">Listening. Release ⌥ to send</Text>
        </Group>
    );
    // The mic's turn: recording while the key is down, sent once it is up.
    const micRow = listening ? listeningRow : sendingRow;
    const replyHint = (
        <Text size="xs" fw={500} className={classes.replyHint}>
            {micOn
                ? 'Replying here. Hold ⌥ and talk, release to send. Marks are optional.'
                : 'Replying here. Hold ⌥ to mark, then type.'}
        </Text>
    );
    // A spoken reply: heard while the key is down, sent once it is up.
    const spokenReply = listening || (byMic && collected.length > 0);
    const replyRow = (): ReactNode => {
        if (minimised || bubble.collection === null) return null;
        if (spokenReply) return micRow;
        return selected ? replyHint : null;
    };

    const body = (): ReactNode => {
        switch (bubble.status) {
            case 'collecting':
                return byMic ? (
                    micRow
                ) : (
                    <Textarea
                        ref={inputRef}
                        aria-label="Message"
                        {...{ [DESIGN_INPUT_ATTRIBUTE]: '' }}
                        placeholder="Say what to change"
                        autosize
                        minRows={1}
                        maxRows={6}
                        value={text}
                        onChange={(event) => setText(event.currentTarget.value)}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter' || event.shiftKey) return;
                            // Enter while picking a composed character is not a send.
                            if (event.nativeEvent.isComposing) return;
                            event.preventDefault();
                            onSend(text);
                        }}
                    />
                );
            case 'queued':
                return (
                    <Badge variant="light" color="gray">
                        Queued
                    </Badge>
                );
            case 'sending':
                // A reply keeps its conversation, so nothing in it is lost.
                if (bubble.threadId) {
                    return (
                        <>
                            {children}
                            {!minimised && sendingRow}
                        </>
                    );
                }
                return minimised ? (
                    <BubblePill
                        agent={null}
                        state="working"
                        marks={collected.map((mark) => mark.number)}
                        color={color}
                        onExpand={onExpand}
                    />
                ) : (
                    sendingRow
                );
            case 'picking-agent':
                return children;
            case 'thread':
                return (
                    <>
                        {children}
                        {replyRow()}
                    </>
                );
            default:
                return assertUnreachable(
                    bubble.status,
                    'Unknown bubble status',
                );
        }
    };

    const unsent =
        bubble.status === 'collecting' || bubble.status === 'picking-agent';

    // A conversation with nothing collected has its own header: the close
    // button sits in that row's corner instead of taking a row.
    const bare = bubble.status === 'thread' && collected.length === 0;
    const controls = (
        <Group
            gap={2}
            wrap="nowrap"
            data-bubble-controls=""
            className={
                bare
                    ? `${classes.controls} ${classes.cornerControls}`
                    : classes.controls
            }
        >
            {canMinimise(bubble) && !listening && (
                <ActionIcon
                    size="sm"
                    aria-label="Minimise"
                    data-bubble-minimise=""
                    onClick={() => {
                        toggledHereRef.current = true;
                        onMinimise();
                    }}
                >
                    <MantineIcon icon={IconMinus} />
                </ActionIcon>
            )}
            {bubble.status !== 'sending' && (
                <ActionIcon
                    size="sm"
                    aria-label={unsent ? 'Discard' : 'Close'}
                    onClick={unsent ? onDiscard : onClose}
                >
                    <MantineIcon icon={IconX} />
                </ActionIcon>
            )}
        </Group>
    );
    // A drag ends in a click on what was dragged: it is not a press.
    const dropClick = (event: ReactMouseEvent) => {
        if (!draggedRef.current) {
            // A press on the pill, whoever drew it, opens the bubble from here.
            if (
                event.target instanceof Element &&
                event.target.closest(`[${BUBBLE_PILL_ATTRIBUTE}]`)
            ) {
                toggledHereRef.current = true;
            }
            return;
        }
        draggedRef.current = false;
        event.preventDefault();
        event.stopPropagation();
    };

    // A click anywhere in a sent bubble, but its own buttons, selects it.
    const selectOnClick = (event: ReactMouseEvent) => {
        if (bubble.status !== 'thread') return;
        if (!(event.target instanceof Element)) return;
        if (event.target.closest('[data-bubble-controls]')) return;
        onSelect();
    };

    return (
        <Paper
            ref={rootRef}
            className={classes.bubble}
            shadow="md"
            p={minimised ? 0 : 'xs'}
            radius={minimised ? 'xl' : undefined}
            data-bubble-id={bubble.id}
            data-minimised={minimised}
            data-selected={selected}
            data-passthrough={passthrough}
            data-dragging={dragging}
            {...{ [CAPTURE_IGNORE_ATTRIBUTE]: '' }}
            __vars={{
                '--bubble-left': `${position.x}px`,
                '--bubble-top': `${position.y}px`,
                '--bubble-stack': `${Math.min(stack, MAX_STACK)}`,
                [BUBBLE_COLOR_VAR]: color,
            }}
            onClickCapture={dropClick}
            onClick={selectOnClick}
            onMouseDownCapture={onRaise}
            onFocusCapture={onRaise}
            onMouseDown={startDrag}
        >
            {minimised ? null : bare ? (
                controls
            ) : (
                <Group
                    gap="xs"
                    wrap="nowrap"
                    justify="space-between"
                    mb={6}
                    {...{ [BUBBLE_DRAG_ATTRIBUTE]: '' }}
                >
                    <Group gap={4}>
                        {collected.map((mark) => (
                            <Badge
                                key={mark.number}
                                circle
                                size="md"
                                color={color}
                                variant="filled"
                                aria-label={`Mark ${mark.number}`}
                            >
                                {mark.number}
                            </Badge>
                        ))}
                    </Group>
                    {controls}
                </Group>
            )}
            <Box>{body()}</Box>
        </Paper>
    );
};

export default DesignBubble;
