import { Anchor, Stack } from '@mantine/core';
import Callout from '../../../../../../components/common/Callout';
import { SettingsPage } from '../../../../../../components/common/Settings/SettingsPage';
import AiAgentAdminMemoriesTable from '../AiAgentAdminMemoriesTable';

export const AiMemoriesSettingsPage = () => (
    <SettingsPage
        title="Memories"
        description="Audit what your AI agents have learned across projects."
    >
        <Stack gap="md">
            <Callout variant="warning" title="AI agent memories are deprecated">
                Add durable project knowledge to{' '}
                <Anchor
                    href="https://docs.lightdash.com/agents/agent-context"
                    target="_blank"
                >
                    project context
                </Anchor>{' '}
                instead. Existing memories below remain available to review.
            </Callout>
            <AiAgentAdminMemoriesTable />
        </Stack>
    </SettingsPage>
);
