import { type AiIdentitySource, type WarehouseTypes } from '@lightdash/common';
import { Anchor, Button, Group, Loader, Text } from '@mantine/core';
import { Fragment } from 'react';
import { Link } from 'react-router';
import Callout from '../../components/common/Callout';
import MantineModal from '../../components/common/MantineModal';
import { useProjectsWithoutAiServiceAccount } from './api';
import { identityWarehouseNames } from './identityLabels';

interface AgentIdentityRuleConfirmModalProps {
    warehouseType: WarehouseTypes;
    source: Exclude<AiIdentitySource, 'agent_sign_in'>;
    onClose: () => void;
    onConfirm: () => void;
    saving: boolean;
}

const AgentIdentityRuleConfirmModal = ({
    warehouseType,
    source,
    onClose,
    onConfirm,
    saving,
}: AgentIdentityRuleConfirmModalProps) => {
    const usesServiceAccount = source === 'ai_service_account';
    const projects = useProjectsWithoutAiServiceAccount(
        warehouseType,
        usesServiceAccount,
    );
    const warehouseName =
        identityWarehouseNames[
            warehouseType as keyof typeof identityWarehouseNames
        ];
    const checkingProjects = usesServiceAccount && projects.isFetching;
    const confirmDisabled =
        usesServiceAccount && (!projects.isSuccess || projects.isFetching);
    const missingProjects = projects.data ?? [];

    return (
        <MantineModal
            opened
            onClose={() => {
                if (!saving) onClose();
            }}
            title={
                usesServiceAccount
                    ? `Use the AI service account for ${warehouseName}?`
                    : `Use each person's credentials for ${warehouseName}?`
            }
            confirmLabel={
                usesServiceAccount
                    ? 'Use the AI service account'
                    : "Use each person's credentials"
            }
            confirmLoading={saving}
            confirmDisabled={confirmDisabled}
            cancelDisabled={saving}
            onConfirm={() => {
                if (saving || confirmDisabled) return;
                onConfirm();
            }}
        >
            <Text size="sm">
                {usesServiceAccount
                    ? `Agents on ${warehouseName} will run as each project's AI service account, not as the person asking.`
                    : `Agents will get the same ${warehouseName} access as the person asking. Your warehouse can't limit agent queries separately.`}
            </Text>
            {usesServiceAccount &&
                (checkingProjects ? (
                    <Loader size="sm" aria-label="Checking AI service accounts" />
                ) : projects.isError ? (
                    <Group gap="xs">
                        <Text size="sm" c="dimmed">
                            Could not check which projects have an AI service
                            account.
                        </Text>
                        <Button
                            variant="default"
                            size="xs"
                            onClick={() => void projects.refetch()}
                        >
                            Retry
                        </Button>
                    </Group>
                ) : missingProjects.length > 0 ? (
                    <Callout variant="warning" color="yellow">
                        {missingProjects.length}{' '}
                        {missingProjects.length === 1
                            ? 'project has'
                            : 'projects have'}{' '}
                        no AI service account yet:{' '}
                        {missingProjects.slice(0, 3).map((project, index) => (
                            <Fragment key={project.projectUuid}>
                                {index > 0 && ', '}
                                <Anchor
                                    component={Link}
                                    size="sm"
                                    to={`/generalSettings/projectManagement/${project.projectUuid}/agentIdentity`}
                                >
                                    {project.name}
                                </Anchor>
                            </Fragment>
                        ))}
                        {missingProjects.length > 3 &&
                            ` and ${missingProjects.length - 3} more`}
                        .{' '}
                        {missingProjects.length === 1
                            ? 'Agents stop working on it until a project admin adds one.'
                            : 'Agents stop working on them until a project admin adds one.'}
                    </Callout>
                ) : null)}
        </MantineModal>
    );
};

export default AgentIdentityRuleConfirmModal;
