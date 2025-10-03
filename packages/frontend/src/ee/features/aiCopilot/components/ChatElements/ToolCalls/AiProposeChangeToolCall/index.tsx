import type {
    AiAgentToolResult,
    ToolProposeChangeArgs,
} from '@lightdash/common';
import {
    Badge,
    Button,
    type DefaultMantineColor,
    Group,
    Stack,
} from '@mantine-8/core';
import { IconExternalLink, IconGitBranch, IconX } from '@tabler/icons-react';
import MantineIcon from '../../../../../../../components/common/MantineIcon';
import { useRevertChangeMutation } from '../../../../hooks/useProjectAiAgents';
import { ToolCallPaper } from '../ToolCallPaper';
import { ChangeRenderer } from './ChangeRenderer';

interface Props
    extends Pick<ToolProposeChangeArgs, 'change' | 'entityTableName'> {
    defaultOpened?: boolean;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
    toolResult: AiAgentToolResult | undefined;
}

const CHANGE_COLORS = {
    update: 'blue',
    create: 'green',
} as const satisfies Record<'update' | 'create', DefaultMantineColor>;

export const AiProposeChangeToolCall: React.FC<Props> = ({
    change,
    entityTableName,
    defaultOpened = true,
    projectUuid,
    agentUuid,
    threadUuid,
    promptUuid,
    toolResult,
}) => {
    const changeType = change.value.type;
    const changeColor: DefaultMantineColor =
        CHANGE_COLORS[changeType] ?? 'gray';

    const { mutate: revertChange, isLoading } = useRevertChangeMutation(
        projectUuid,
        agentUuid,
        threadUuid,
    );

    const metadata =
        toolResult?.toolName === 'proposeChange' &&
        toolResult.metadata?.status === 'success'
            ? toolResult.metadata
            : null;

    const changeUuid = metadata?.changeUuid;

    const isRejected = metadata?.userFeedback === 'rejected';

    const handleReject = () => {
        if (changeUuid) {
            revertChange({ promptUuid, changeUuid });
        }
    };

    return (
        <ToolCallPaper
            defaultOpened={defaultOpened}
            icon={IconGitBranch}
            title={
                <Group gap="xs">
                    <span>Semantic Layer changes</span>
                    <Badge
                        radius="sm"
                        size="sm"
                        variant="light"
                        color={changeColor}
                    >
                        {changeType}
                    </Badge>
                </Group>
            }
            rightAction={
                <Button
                    component="a"
                    href={`/generalSettings/projectManagement/${projectUuid}/changesets`}
                    target="_blank"
                    variant="subtle"
                    size="compact-xs"
                    rightSection={
                        <MantineIcon icon={IconExternalLink} size={14} />
                    }
                    // do not bubble up event to close the collapsible
                    onClick={(e) => {
                        e.stopPropagation();
                    }}
                >
                    View Changeset
                </Button>
            }
        >
            <Stack gap="xs" mt="xs">
                <ChangeRenderer
                    change={change}
                    entityTableName={entityTableName}
                    metadata={metadata}
                />

                <Group w="100%" justify="flex-end" pr="xs">
                    <Button
                        variant="default"
                        size="compact-xs"
                        leftSection={<MantineIcon icon={IconX} size={12} />}
                        onClick={handleReject}
                        disabled={!changeUuid || isRejected || isLoading}
                        loading={isLoading}
                    >
                        {isRejected ? 'Rejected' : 'Reject'}
                    </Button>
                </Group>
            </Stack>
        </ToolCallPaper>
    );
};
