import { Anchor, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useAutoFetch } from '../RunQuerySettings/useAutoFetch';
import { ExplorerHint } from './onboarding';

type Props = {
    /** What running the query brings back, e.g. "your chart" */
    subject: string;
};

/**
 * Shown when the selection no longer matches what is on screen: run the
 * query, or have it re-run on every change until the tab closes.
 */
const StaleResultsPrompt: FC<Props> = ({ subject }) => {
    const { enableForSession } = useAutoFetch();

    return (
        <Stack gap={2} align="center">
            <Text fz="sm" fw={500}>
                Run query to see {subject}
            </Text>
            <Text fz="xs" c="dimmed">
                Your selected fields changed.
            </Text>
            <Anchor
                component="button"
                fz="xs"
                mt={6}
                data-tour="explorer-auto-rerun"
                onClick={enableForSession}
            >
                Re-run automatically for this session
            </Anchor>
            <ExplorerHint
                name="auto-rerun"
                target='[data-tour="explorer-auto-rerun"]'
                title="Tired of re-running?"
                body="Turn this on and the query re-runs every time you change a field, until you close this tab."
                position="bottom"
            />
        </Stack>
    );
};

export default StaleResultsPrompt;
