import {
    Avatar,
    Badge,
    Box,
    Loader,
    Text,
    UnstyledButton,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconMessageQuestion,
    IconSparkles,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { LightdashUserAvatar } from '../../../../components/Avatar';
import MantineIcon from '../../../../components/common/MantineIcon';
import {
    BUBBLE_PILL_ATTRIBUTE,
    pillLabel,
    type PillState,
} from '../bubblePill';
import { BUBBLE_DRAG_ATTRIBUTE } from '../bubblePointer';
import classes from './BubblePill.module.css';

type Props = {
    /** Null until the bubble has an agent. */
    agent: { name: string; imageUrl: string | null } | null;
    state: PillState;
    /** The numbers of the bubble's marks, oldest first. */
    marks: number[];
    /** The bubble's colour. */
    color: string;
    onExpand: () => void;
};

/** A minimised bubble: who is answering, how far along, and which marks it is about. */
const BubblePill: FC<Props> = ({ agent, state, marks, color, onExpand }) => {
    const label = pillLabel(state) ?? agent?.name ?? 'Conversation';
    return (
        <UnstyledButton
            className={classes.pill}
            aria-label={`Expand: ${label}`}
            data-state={state}
            {...{ [BUBBLE_PILL_ATTRIBUTE]: '', [BUBBLE_DRAG_ATTRIBUTE]: '' }}
            onClick={onExpand}
        >
            {agent ? (
                <LightdashUserAvatar
                    size={26}
                    name={agent.name}
                    src={agent.imageUrl}
                />
            ) : (
                <Avatar size={26} radius="xl" color="gray">
                    <MantineIcon icon={IconSparkles} size={14} />
                </Avatar>
            )}
            {state === 'working' && (
                <Loader size={12} color={color} data-testid="pill-spinner" />
            )}
            {state === 'ready' && (
                <Box className={classes.unread} data-testid="pill-unread" />
            )}
            {state === 'needs-answer' && (
                <MantineIcon icon={IconMessageQuestion} size={16} />
            )}
            {state === 'failed' && (
                <MantineIcon icon={IconAlertTriangle} size={16} color="red" />
            )}
            <Text size="sm" fw={500} truncate maw={180}>
                {label}
            </Text>
            {marks.length > 0 && (
                <Badge
                    circle
                    size="sm"
                    color={color}
                    variant="filled"
                    aria-label={`Mark ${marks[0]}`}
                >
                    {marks[0]}
                </Badge>
            )}
            {marks.length > 1 && (
                <Text size="xs" c="dimmed" className={classes.more}>
                    +{marks.length - 1}
                </Text>
            )}
        </UnstyledButton>
    );
};

export default BubblePill;
