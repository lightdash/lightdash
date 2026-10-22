import {
    assertUnreachable,
    type AiAgentThreadSummary,
    type AiPromptContextItem,
    type AiThreadBindingSummary,
} from '@lightdash/common';
import {
    Collapse,
    Group,
    Paper,
    ScrollArea,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { IconChevronRight, IconNotes } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useUiStrings } from '../../../../providers/Embed/useUiStrings';
import { PinnedContextCard } from '../PinnedContextCard/PinnedContextCard';
import { ContentReferenceLink } from './ContentReferenceLink';
import styles from './ThreadSetupHeader.module.css';

const BoundResourceRow: FC<{
    label: string;
    unavailableLabel: string;
    kind: 'dashboard' | 'chart';
    item: AiPromptContextItem | null;
    projectUuid: string;
}> = ({ label, unavailableLabel, kind, item, projectUuid }) => (
    <Group gap="xs" wrap="wrap">
        <Text size="xs" c="dimmed" fw={500}>
            {label}
        </Text>
        {item === null ? (
            <ContentReferenceLink kind={kind} showArrow={false}>
                {unavailableLabel}
            </ContentReferenceLink>
        ) : (
            <PinnedContextCard
                item={item}
                projectUuid={projectUuid}
                previewScope={null}
            />
        )}
    </Group>
);

const BoundResource: FC<{
    binding: AiThreadBindingSummary;
    projectUuid: string;
}> = ({ binding, projectUuid }) => {
    const uiStrings = useUiStrings();

    switch (binding.type) {
        case 'dashboard':
            return (
                <BoundResourceRow
                    label={uiStrings('aiAgent.thread.boundDashboard')}
                    unavailableLabel={uiStrings(
                        'aiAgent.thread.boundDashboardUnavailable',
                    )}
                    kind="dashboard"
                    item={
                        binding.displayName === null
                            ? null
                            : {
                                  type: 'dashboard',
                                  dashboardUuid: binding.dashboardUuid,
                                  dashboardSlug: null,
                                  displayName: binding.displayName,
                                  pinnedVersionUuid: null,
                                  runtimeOverrides: null,
                              }
                    }
                    projectUuid={projectUuid}
                />
            );
        case 'chart':
            return (
                <BoundResourceRow
                    label={uiStrings('aiAgent.thread.boundChart')}
                    unavailableLabel={uiStrings(
                        'aiAgent.thread.boundChartUnavailable',
                    )}
                    kind="chart"
                    item={
                        binding.displayName === null
                            ? null
                            : {
                                  type: 'chart',
                                  chartUuid: binding.chartUuid,
                                  chartSlug: null,
                                  displayName: binding.displayName,
                                  pinnedVersionUuid: null,
                                  runtimeOverrides: null,
                                  chartKind: null,
                              }
                    }
                    projectUuid={projectUuid}
                />
            );
        default:
            return assertUnreachable(binding, 'Unknown binding type');
    }
};

const ThreadContextBlock: FC<{ threadContext: string }> = ({
    threadContext,
}) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <Stack gap={0}>
            <UnstyledButton
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
            >
                <Group gap={6} wrap="nowrap">
                    <MantineIcon
                        icon={IconChevronRight}
                        size="sm"
                        color="dimmed"
                        className={
                            expanded ? styles.chevronExpanded : styles.chevron
                        }
                    />
                    <MantineIcon icon={IconNotes} size="sm" color="dimmed" />
                    <Text size="xs" c="dimmed" fw={500}>
                        Thread context
                    </Text>
                </Group>
            </UnstyledButton>
            <Collapse expanded={expanded}>
                <ScrollArea.Autosize mah={240} mt="xs">
                    <Text size="sm" c="ldGray.7" className={styles.contextText}>
                        {threadContext}
                    </Text>
                </ScrollArea.Autosize>
            </Collapse>
        </Stack>
    );
};

type Props = {
    thread: Pick<AiAgentThreadSummary, 'binding' | 'threadContext'>;
    projectUuid: string;
};

// The server only returns the thread context to viewers with view:AiAgentThreadContext.
export const ThreadSetupHeader: FC<Props> = ({ thread, projectUuid }) => {
    const { binding, threadContext } = thread;

    if (!binding && !threadContext) return null;

    return (
        <Paper px="sm" py="xs" bg="ldGray.0">
            <Stack gap="xs">
                {binding && (
                    <BoundResource
                        binding={binding}
                        projectUuid={projectUuid}
                    />
                )}
                {threadContext && (
                    <ThreadContextBlock threadContext={threadContext} />
                )}
            </Stack>
        </Paper>
    );
};
