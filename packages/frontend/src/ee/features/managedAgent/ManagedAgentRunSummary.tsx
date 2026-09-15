import { Anchor, Stack } from '@mantine/core';
import { useState, type FC } from 'react';
import { AiMarkdown } from '../../../components/common/AiMarkdown';
import classes from './ManagedAgentActivityPage.module.css';
import { splitRunSummary } from './utils/runSummaryMarkdown';

export const ManagedAgentRunSummary: FC<{ summary: string }> = ({
    summary,
}) => {
    const [expanded, setExpanded] = useState(false);
    const { lead, full } = splitRunSummary(summary);
    const hasMore = full !== lead;
    return (
        <Stack gap={6} align="flex-start">
            <AiMarkdown className={classes.runSummaryMarkdown}>
                {expanded ? full : lead}
            </AiMarkdown>
            {hasMore && (
                <Anchor
                    component="button"
                    type="button"
                    fz="xs"
                    fw={500}
                    c="dimmed"
                    underline="always"
                    onClick={() => setExpanded((value) => !value)}
                >
                    {expanded ? 'Show less' : 'Read the full report'}
                </Anchor>
            )}
        </Stack>
    );
};
