import type { AiQuickReply } from '@lightdash/common';
import { Box, Button } from '@mantine/core';
import type { FC } from 'react';
import styles from './AgentSuggestionChips.module.css';

type Props = {
    replies: AiQuickReply[];
    onSelect: (prompt: string) => void;
};

export const AgentQuickReplies: FC<Props> = ({ replies, onSelect }) => (
    <Box className={`${styles.row} ${styles.rowLeft}`}>
        {replies.map((reply, index) => (
            <Button
                key={reply.prompt}
                variant="default"
                size="xs"
                className={`${styles.chip} ${styles.fadeIn}`}
                style={{ ['--chip-idx' as string]: index }}
                onClick={() => onSelect(reply.prompt)}
            >
                {reply.label}
            </Button>
        ))}
    </Box>
);
