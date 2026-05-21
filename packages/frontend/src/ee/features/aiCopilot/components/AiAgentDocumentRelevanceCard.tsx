import type { AiAgentDocumentStructuredSummary } from '@lightdash/common';
import { Group, Paper, Text } from '@mantine-8/core';
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';
import MantineIcon from '../../../../components/common/MantineIcon';

type Props = {
    summary: AiAgentDocumentStructuredSummary;
};

export const AiAgentDocumentRelevanceCard = ({ summary }: Props) => {
    const { warning, relevance } = summary;
    const isNotRelevant =
        !!warning || relevance === 'low' || relevance === 'none';

    if (isNotRelevant) {
        return (
            <Paper p="sm" radius="md" withBorder>
                <Group gap="xs" wrap="nowrap" align="flex-start">
                    <MantineIcon
                        icon={IconAlertTriangle}
                        size="sm"
                        color="orange"
                        style={{ flexShrink: 0, marginTop: 2 }}
                    />
                    <Text size="xs" c="dimmed">
                        {warning ??
                            'This document does not appear to relate to the project — the agent may ignore it.'}
                    </Text>
                </Group>
            </Paper>
        );
    }

    return (
        <Paper p="sm" radius="md" withBorder>
            <Group gap="xs" wrap="nowrap" align="flex-start">
                <MantineIcon
                    icon={IconInfoCircle}
                    size="sm"
                    color="gray"
                    style={{ flexShrink: 0, marginTop: 2 }}
                />
                <Text size="xs" c="dimmed">
                    The agent uses this summary to decide whether to read the
                    file. The full text is retrieved on demand.
                </Text>
            </Group>
        </Paper>
    );
};
