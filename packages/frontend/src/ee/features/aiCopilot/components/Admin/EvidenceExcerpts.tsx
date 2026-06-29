import { type AiAgentEvidenceExcerpt } from '@lightdash/common';
import { Box, Stack, Text } from '@mantine-8/core';
import { type FC } from 'react';
import { AiMarkdown } from '../../../../../components/common/AiMarkdown';
import {
    cleanExcerptText,
    getRenderableExcerpts,
} from './evidenceExcerptHelpers';
import styles from './EvidenceExcerpts.module.css';

const SOURCE_LABELS: Record<AiAgentEvidenceExcerpt['source'], string> = {
    user_prompt: 'User asked',
    assistant_answer: 'Assistant answered',
    next_user_prompt: 'User then said',
    conversation_context: 'Context',
    tool_call: 'Tool call',
    tool_result: 'Tool result',
    agent_config: 'Agent config',
};

const PRIMARY_SOURCES = new Set<AiAgentEvidenceExcerpt['source']>([
    'user_prompt',
    'assistant_answer',
    'next_user_prompt',
]);

type Props = {
    excerpts: AiAgentEvidenceExcerpt[];
};

export const EvidenceExcerpts: FC<Props> = ({ excerpts }) => {
    const renderable = getRenderableExcerpts(excerpts);

    if (renderable.length === 0) {
        return null;
    }

    return (
        <Stack
            data-testid="evidence-excerpts"
            className={styles.excerpts}
            gap="md"
        >
            {renderable.map((excerpt) => {
                const muted = !PRIMARY_SOURCES.has(excerpt.source);
                return (
                    <Stack
                        key={`${excerpt.source}-${excerpt.text.slice(0, 48)}`}
                        gap={3}
                    >
                        <Text
                            className={styles.label}
                            data-muted={muted || undefined}
                        >
                            {SOURCE_LABELS[excerpt.source]}
                        </Text>
                        <Box
                            className={styles.text}
                            data-muted={muted || undefined}
                        >
                            <AiMarkdown>
                                {cleanExcerptText(excerpt.text)}
                            </AiMarkdown>
                        </Box>
                    </Stack>
                );
            })}
        </Stack>
    );
};
