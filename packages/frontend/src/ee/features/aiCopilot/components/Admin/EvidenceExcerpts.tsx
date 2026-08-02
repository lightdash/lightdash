import { type AiAgentEvidenceExcerpt } from '@lightdash/common';
import { Box, Text } from '@mantine-8/core';
import { Fragment, type FC } from 'react';
import { AiMarkdown } from '../../../../../components/common/AiMarkdown';
import {
    cleanExcerptText,
    getRenderableExcerpts,
} from './evidenceExcerptHelpers';
import styles from './EvidenceExcerpts.module.css';

const SOURCE_LABELS: Record<AiAgentEvidenceExcerpt['source'], string> = {
    user_prompt: 'User',
    assistant_answer: 'Assistant',
    next_user_prompt: 'User reply',
    conversation_context: 'Context',
    tool_call: 'Tool call',
    tool_result: 'Tool result',
    agent_config: 'Config',
};

const PRIMARY_SOURCES = new Set<AiAgentEvidenceExcerpt['source']>([
    'user_prompt',
    'assistant_answer',
    'next_user_prompt',
]);

const MONO_SOURCES = new Set<AiAgentEvidenceExcerpt['source']>([
    'tool_call',
    'tool_result',
]);

type Props = {
    excerpts: AiAgentEvidenceExcerpt[];
};

/**
 * Cited turns rendered as a compact transcript ledger: speaker in a
 * right-aligned gutter (the same column grammar as the Activity timeline),
 * the quoted text beside it. Consecutive turns from the same speaker keep
 * one label so the exchange reads as a conversation, not a list of blocks.
 */
export const EvidenceExcerpts: FC<Props> = ({ excerpts }) => {
    const renderable = getRenderableExcerpts(excerpts);

    // A `next_user_prompt` that repeats an earlier turn verbatim is the user
    // re-asking — the signal is the repeat, not a new question. Showing the
    // same text twice under two labels reads as a bug, so drop the echo.
    const seen = new Set<string>();
    const deduped = renderable.filter((excerpt) => {
        const key = cleanExcerptText(excerpt.text).trim().toLowerCase();
        if (excerpt.source === 'next_user_prompt' && seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });

    if (deduped.length === 0) {
        return null;
    }

    return (
        <Box data-testid="evidence-excerpts" className={styles.transcript}>
            {deduped.map((excerpt, index) => {
                const label = SOURCE_LABELS[excerpt.source];
                const repeated =
                    index > 0 &&
                    SOURCE_LABELS[deduped[index - 1].source] === label;
                const muted = !PRIMARY_SOURCES.has(excerpt.source);
                const mono = MONO_SOURCES.has(excerpt.source);
                return (
                    <Fragment
                        key={`${excerpt.source}-${excerpt.text.slice(0, 48)}`}
                    >
                        <Text
                            className={styles.speaker}
                            data-muted={muted || undefined}
                        >
                            {repeated ? '' : label}
                        </Text>
                        <Box
                            className={styles.text}
                            data-muted={muted || undefined}
                            data-mono={mono || undefined}
                        >
                            {mono ? (
                                cleanExcerptText(excerpt.text)
                            ) : (
                                <AiMarkdown>
                                    {cleanExcerptText(excerpt.text)}
                                </AiMarkdown>
                            )}
                        </Box>
                    </Fragment>
                );
            })}
        </Box>
    );
};
