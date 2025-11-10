import type { AiAgentMessageAssistant, AiArtifact } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { useDisclosure, useMediaQuery } from '@mantine-8/hooks';
import {
    IconCircleCheck,
    IconCircleCheckFilled,
    IconX,
} from '@tabler/icons-react';
import type { FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { useSetArtifactVersionVerified } from '../../hooks/useAiAgentArtifacts';
import { useAiAgentPermission } from '../../hooks/useAiAgentPermission';
import { useProjectAiAgent } from '../../hooks/useProjectAiAgents';
import { AiChartQuickOptions } from './AiChartQuickOptions';
import { ViewSqlButton } from './ViewSqlButton';

type Props = {
    projectUuid: string;
    agentUuid: string;
    artifactData: AiArtifact;
    message: AiAgentMessageAssistant;
    title: string | null;
    description?: string | null;
    compiledSql?: string;
    showCloseButton?: boolean;
    onClose?: () => void;
};

export const AiChartVisualizationHeader: FC<Props> = ({
    projectUuid,
    agentUuid,
    artifactData,
    message,
    title,
    description,
    compiledSql,
    showCloseButton = true,
    onClose,
}) => {
    const isMobile = useMediaQuery('(max-width: 768px)');
    const [
        verifyModalOpened,
        { open: openVerifyModal, close: closeVerifyModal },
    ] = useDisclosure(false);

    const { mutate: setVerified } = useSetArtifactVersionVerified(
        projectUuid,
        agentUuid,
    );
    const canManageAgent = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });
    const { data: agent } = useProjectAiAgent(projectUuid, agentUuid);

    const isVerified = artifactData?.verifiedByUserUuid !== null;
    const isAgentVersion3 = agent?.version === 3;

    const handleVerifyToggle = () => {
        if (isVerified) {
            openVerifyModal();
        } else {
            setVerified({
                artifactUuid: artifactData.artifactUuid,
                versionUuid: artifactData.versionUuid,
                verified: true,
            });
        }
    };

    const handleConfirmUnverify = () => {
        setVerified({
            artifactUuid: artifactData.artifactUuid,
            versionUuid: artifactData.versionUuid,
            verified: false,
        });
        closeVerifyModal();
    };

    return (
        <>
            <Group gap="md" align="start">
                <Group gap="xs" flex={1} align="start">
                    {canManageAgent && isAgentVersion3 && (
                        <Tooltip
                            label={
                                isVerified
                                    ? 'Remove from verified answers'
                                    : 'Add to verified answers'
                            }
                        >
                            <ActionIcon
                                size="sm"
                                variant="light"
                                color={isVerified ? 'green' : 'gray'}
                                onClick={handleVerifyToggle}
                            >
                                <MantineIcon
                                    icon={
                                        isVerified
                                            ? IconCircleCheckFilled
                                            : IconCircleCheck
                                    }
                                />
                            </ActionIcon>
                        </Tooltip>
                    )}
                    <Stack gap={0} flex={1}>
                        <Title order={5}>{title ?? 'Untitled'}</Title>
                        {description && (
                            <Text c="dimmed" size="xs">
                                {description}
                            </Text>
                        )}
                    </Stack>
                </Group>
                <Group gap="sm" display={isMobile ? 'none' : 'flex'}>
                    <ViewSqlButton sql={compiledSql} />
                    <AiChartQuickOptions
                        message={message}
                        projectUuid={projectUuid}
                        artifactData={artifactData}
                        saveChartOptions={{
                            name: title ?? 'Untitled',
                            description: description ?? null,
                            linkToMessage: true,
                        }}
                        compiledSql={compiledSql}
                    />
                    {showCloseButton && onClose && (
                        <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="gray"
                            onClick={onClose}
                        >
                            <MantineIcon icon={IconX} color="gray" />
                        </ActionIcon>
                    )}
                </Group>
            </Group>

            <MantineModal
                opened={verifyModalOpened}
                onClose={closeVerifyModal}
                title="Remove from verified answers"
                icon={IconCircleCheck}
                size="sm"
                actions={
                    <Group gap="sm">
                        <Button variant="default" onClick={closeVerifyModal}>
                            Cancel
                        </Button>
                        <Button color="red" onClick={handleConfirmUnverify}>
                            Confirm
                        </Button>
                    </Group>
                }
            >
                <Text>
                    Are you sure you want to remove this answer from verified
                    answers? It will no longer be used as an example in future
                    Agent responses.
                </Text>
            </MantineModal>
        </>
    );
};
