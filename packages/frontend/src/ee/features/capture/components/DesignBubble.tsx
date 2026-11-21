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
    type CSSProperties,
    type FC,
    type ReactNode,
} from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { type Bubble } from '../designSession';
import { CAPTURE_IGNORE_ATTRIBUTE } from '../frameSource';
import { DESIGN_INPUT_ATTRIBUTE } from '../holdKeys';
import classes from './DesignBubble.module.css';

type Props = {
    bubble: Bubble;
    /** Top left, in viewport pixels. */
    position: { x: number; y: number };
    /** A hold is down: the bubble fades and lets the pointer through. */
    passthrough: boolean;
    /** The mic is recording into this bubble. */
    listening: boolean;
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
    passthrough,
    listening,
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
            className={classes.bubble}
            shadow="md"
            p="xs"
            data-bubble-id={bubble.id}
            data-passthrough={passthrough}
            {...{ [CAPTURE_IGNORE_ATTRIBUTE]: '' }}
            style={
                {
                    '--bubble-left': `${position.x}px`,
                    '--bubble-top': `${position.y}px`,
                } as CSSProperties
            }
        >
            {bare ? (
                closeButton
            ) : (
                <Group gap="xs" wrap="nowrap" justify="space-between" mb={6}>
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
