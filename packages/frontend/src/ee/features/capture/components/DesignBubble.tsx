import { assertUnreachable } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Group,
    Loader,
    Paper,
    Text,
    Textarea,
} from '@mantine/core';
import { IconMicrophone, IconX } from '@tabler/icons-react';
import {
    useEffect,
    useRef,
    useState,
    type FC,
    type MouseEvent as ReactMouseEvent,
    type ReactNode,
} from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import {
    BUBBLE_DRAG_ATTRIBUTE,
    clampDrag,
    dragStartsOn,
    wheelScrollsInside,
} from '../bubblePointer';
import { type Bubble } from '../designSession';
import { CAPTURE_IGNORE_ATTRIBUTE } from '../frameSource';
import { DESIGN_INPUT_ATTRIBUTE } from '../holdKeys';
import classes from './DesignBubble.module.css';

// A press on the header that moves less than this is a click.
const DRAG_START_PX = 3;
// Bubbles stay under modals and popovers however many there are.
const MAX_STACK = 60;

type Props = {
    bubble: Bubble;
    /** Top left, in viewport pixels. */
    position: { x: number; y: number };
    /** Its place among the bubbles, 0 at the back. */
    stack: number;
    /** A hold is down: the bubble fades and lets the pointer through. */
    passthrough: boolean;
    /** The mic is recording into this bubble. */
    listening: boolean;
    /** Pressed or focused: it comes to the front. */
    onRaise: () => void;
    /** Dragged by its header to this top left, in viewport pixels. */
    onMove: (position: { x: number; y: number }) => void;
    onSend: (text: string) => void;
    onStop: () => void;
    onDiscard: () => void;
    onClose: () => void;
    /** The agent picker or the thread, once the bubble is sent. */
    children: ReactNode;
};

const DesignBubble: FC<Props> = ({
    bubble,
    position,
    stack,
    passthrough,
    listening,
    onRaise,
    onMove,
    onSend,
    onStop,
    onDiscard,
    onClose,
    children,
}) => {
    const [text, setText] = useState('');
    const inputRef = useRef<HTMLTextAreaElement | null>(null);
    const collected =
        bubble.collection?.capture.status === 'recording'
            ? bubble.collection.capture.marks
            : [];
    const typing = bubble.status === 'collecting' && !listening;

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
        const from = { x: event.clientX, y: event.clientY };
        const start = position;
        let moving = false;
        const move = (next: MouseEvent) => {
            const dx = next.clientX - from.x;
            const dy = next.clientY - from.y;
            if (!moving && Math.hypot(dx, dy) < DRAG_START_PX) return;
            if (!moving) setDragging(true);
            moving = true;
            onMoveRef.current(
                clampDrag(
                    { x: start.x + dx, y: start.y + dy },
                    root.getBoundingClientRect(),
                    new DOMRect(0, 0, window.innerWidth, window.innerHeight),
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

    const stopRow = (
        <Group gap="xs" wrap="nowrap" justify="space-between">
            <Group gap={6} wrap="nowrap" className={classes.listening}>
                <MantineIcon icon={IconMicrophone} color="red" />
                <Text size="sm">Listening</Text>
            </Group>
            <Button size="xs" color="red" onClick={onStop}>
                Stop
            </Button>
        </Group>
    );

    const body = (): ReactNode => {
        switch (bubble.status) {
            case 'collecting':
                return listening ? (
                    stopRow
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
                return (
                    <Group gap="xs" wrap="nowrap">
                        <Loader size="xs" />
                        <Text size="sm" c="dimmed">
                            Sending
                        </Text>
                    </Group>
                );
            case 'picking-agent':
                return children;
            case 'thread':
                return (
                    <>
                        {children}
                        {listening && stopRow}
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
    const closeButton = (
        <ActionIcon
            size="sm"
            className={bare ? classes.cornerClose : undefined}
            aria-label={unsent ? 'Discard' : 'Close'}
            onClick={unsent ? onDiscard : onClose}
        >
            <MantineIcon icon={IconX} />
        </ActionIcon>
    );

    return (
        <Paper
            ref={rootRef}
            className={classes.bubble}
            shadow="md"
            p="xs"
            data-bubble-id={bubble.id}
            data-passthrough={passthrough}
            data-dragging={dragging}
            {...{ [CAPTURE_IGNORE_ATTRIBUTE]: '' }}
            __vars={{
                '--bubble-left': `${position.x}px`,
                '--bubble-top': `${position.y}px`,
                '--bubble-stack': `${Math.min(stack, MAX_STACK)}`,
            }}
            onMouseDownCapture={onRaise}
            onFocusCapture={onRaise}
            onMouseDown={startDrag}
        >
            {bare ? (
                closeButton
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
                                color="red"
                                variant="filled"
                                aria-label={`Mark ${mark.number}`}
                            >
                                {mark.number}
                            </Badge>
                        ))}
                    </Group>
                    {bubble.status !== 'sending' && closeButton}
                </Group>
            )}
            <Box>{body()}</Box>
        </Paper>
    );
};

export default DesignBubble;
