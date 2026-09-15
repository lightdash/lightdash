import { Spoiler } from '@mantine/core';
import { type FC } from 'react';
import { AiMarkdown } from '../../../components/common/AiMarkdown';
import classes from './ManagedAgentActivityPage.module.css';
import { toRunSummaryMarkdown } from './utils/runSummaryMarkdown';

// Roughly six lines of the report; the rest opens on demand.
const COLLAPSED_HEIGHT = 120;

export const ManagedAgentRunSummary: FC<{ summary: string }> = ({
    summary,
}) => (
    <Spoiler
        maxHeight={COLLAPSED_HEIGHT}
        showLabel="Read the full report"
        hideLabel="Show less"
        classNames={{
            root: classes.runSummarySpoiler,
            content: classes.runSummaryContent,
            control: classes.runSummaryControl,
        }}
    >
        <AiMarkdown className={classes.runSummaryMarkdown}>
            {toRunSummaryMarkdown(summary)}
        </AiMarkdown>
    </Spoiler>
);
