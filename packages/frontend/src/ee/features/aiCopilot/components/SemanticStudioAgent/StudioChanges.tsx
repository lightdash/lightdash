import { Badge, Box, Group, Stack, Text } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import { DiffMarkdownCodeBlock } from '../ChatElements/DiffMarkdownCodeBlock';
import { PullRequestChanges } from './PullRequestChanges';
import classes from './SemanticStudioAgent.module.css';
import { type StudioPullRequest } from './useStudioPullRequest';

/** Everything a dbt project's conversation has changed and not made live: what it proposes now, then what its pull request holds. */
export const StudioChanges: FC<{
    /** What heads the column: the change's name, progress and actions. */
    header: ReactNode;
    projectUuid: string;
    pullRequest: StudioPullRequest | null;
    /** The diffs the latest reply proposes and has not saved, one per file. */
    proposal: string[];
}> = ({ header, projectUuid, pullRequest, proposal }) => (
    <Box className={classes.changes}>
        {header}
        {proposal.length > 0 ? (
            // Keyed by what is proposed, so a new proposal arrives again.
            <Stack
                key={proposal.join('\n')}
                gap="xs"
                className={classes.arrives}
            >
                <Group gap="xs" wrap="nowrap">
                    <Badge color="gray" flex="none">
                        Proposed
                    </Badge>
                    <Text fz="xs" c="dimmed">
                        {pullRequest
                            ? 'Not saved yet. Save it to the pull request from the chat.'
                            : 'Not saved yet. Open the pull request from the chat to save it.'}
                    </Text>
                </Group>
                {proposal.map((code) => (
                    <DiffMarkdownCodeBlock
                        key={code}
                        code={code}
                        language="diff"
                        isIncomplete={false}
                    />
                ))}
            </Stack>
        ) : null}
        {pullRequest ? (
            // Keyed by its commit, so a save arrives as new.
            <PullRequestChanges
                key={pullRequest.commitSha}
                projectUuid={projectUuid}
                pullRequest={pullRequest}
            />
        ) : null}
    </Box>
);
