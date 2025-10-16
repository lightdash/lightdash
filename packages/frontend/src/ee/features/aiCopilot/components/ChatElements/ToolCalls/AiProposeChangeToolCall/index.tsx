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
import { useChange } from '../../../../../../../features/changesets/hooks/useChange';
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
    toolResult:
        | Extract<AiAgentToolResult, { toolName: 'proposeChange' }>
        | undefined;
}

const CHANGE_COLORS = {
    update: 'blue',
    create: 'green',
} as const satisfies Record<'update' | 'create', DefaultMantineColor>;

export const AiProposeChangeToolCall = ({
    change,
    entityTableName,
    defaultOpened = true,
    projectUuid,
    agentUuid,
    threadUuid,
    promptUuid,
    toolResult,
}: Props) => {
    const changeType = change.value.type;
    const changeColor: DefaultMantineColor =
        CHANGE_COLORS[changeType] ?? 'gray';

    const { mutate: revertChange, isLoading } = useRevertChangeMutation(
        projectUuid,
        agentUuid,
        threadUuid,
    );

    const metadata = toolResult?.metadata;
    const isSuccessResult = metadata?.status === 'success';
    const changeUuid = isSuccessResult ? metadata.changeUuid : undefined;

    // Fetch the full compiled change data from backend (source of truth)
    const {
        isLoading: isLoadingChange,
        error: changeError,
        data: changeData,
    } = useChange(projectUuid, changeUuid);

    const isChangeDeleted = changeError?.error?.statusCode === 404;
    const isRejectedByMetadata =
        isSuccessResult && metadata?.userFeedback === 'rejected';

    const buttonText = isChangeDeleted
        ? 'Reverted'
        : isRejectedByMetadata
        ? 'Rejected'
        : 'Reject';

    const handleReject = () => {
        if (changeUuid) {
            revertChange({ promptUuid, changeUuid });
        }
    };

    return (
        <ToolCallPaper
            defaultOpened={defaultOpened}
            icon={IconGitBranch}
            hasError={!isSuccessResult}
            title={
                <Group gap="xs">
                    <span>
                        {isSuccessResult
                            ? 'Semantic Layer changes'
                            : 'Failed to update Semantic Layer'}
                    </span>

                    {isSuccessResult && (
                        <Badge
                            radius="sm"
                            size="sm"
                            variant="light"
                            color={changeColor}
                        >
                            {changeType}
                        </Badge>
                    )}
                </Group>
            }
            rightAction={
                isSuccessResult && (
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
                )
            }
        >
            <Stack gap="xs" mt="xs">
                {/*
                    ChangeRenderer uses changeData as primary source when available,
                    and falls back to proposedChange (AI proposal) for loading/error states
                */}
                <ChangeRenderer
                    changeData={changeData}
                    proposedChange={change}
                    entityTableName={entityTableName}
                />

                {isSuccessResult && (
                    <Group w="100%" justify="flex-end" pr="xs">
                        <Button
                            variant="default"
                            size="compact-xs"
                            leftSection={<MantineIcon icon={IconX} size={12} />}
                            onClick={handleReject}
                            disabled={
                                isRejectedByMetadata ||
                                isChangeDeleted ||
                                isLoading ||
                                isLoadingChange
                            }
                            loading={isLoading}
                        >
                            {buttonText}
                        </Button>
                    </Group>
                )}
            </Stack>
        </ToolCallPaper>
    );
};
