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

const getConfirmationCopy = (
    source: AgentIdentityRuleConfirmModalProps['source'],
    warehouseName: string,
) => {
    if (source === 'ai_service_account') {
        return {
            title: `Use a shared agent account for ${warehouseName}?`,
            body: `Agents on ${warehouseName} will run as each project's shared agent account, not as the person asking.`,
            confirmLabel: 'Use a shared agent account',
        };
    }

    return {
        title: `Run agents as the person on ${warehouseName}?`,
        body: `Agents will get the same ${warehouseName} access as the person asking. Your warehouse can't limit agent queries separately.`,
        confirmLabel: 'Run as the person',
    };
};

const ProjectsWithoutAiServiceAccountNotice = ({
    projects,
}: {
    projects: ReturnType<typeof useProjectsWithoutAiServiceAccount>;
}) => {
    if (projects.isFetching) {
        return <Loader size="sm" aria-label="Checking shared agent accounts" />;
    }

    if (projects.isError) {
        return (
            <Group gap="xs">
                <Text size="sm" c="dimmed">
                    Could not check which projects have a shared agent account.
                </Text>
                <Button
                    variant="default"
                    size="xs"
                    onClick={() => void projects.refetch()}
                >
                    Retry
                </Button>
            </Group>
        );
    }

    const missingProjects = projects.data ?? [];
    if (missingProjects.length === 0) return null;

    return (
        <Callout variant="warning" color="yellow">
            {missingProjects.length}{' '}
            {missingProjects.length === 1 ? 'project has' : 'projects have'} no
            shared agent account yet:{' '}
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
    );
};

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
    const copy = getConfirmationCopy(source, warehouseName);
    const confirmDisabled =
        usesServiceAccount && (!projects.isSuccess || projects.isFetching);

    return (
        <MantineModal
            opened
            onClose={() => {
                if (!saving) onClose();
            }}
            title={copy.title}
            confirmLabel={copy.confirmLabel}
            confirmLoading={saving}
            confirmDisabled={confirmDisabled}
            cancelDisabled={saving}
            onConfirm={() => {
                if (saving || confirmDisabled) return;
                onConfirm();
            }}
        >
            <Text size="sm">{copy.body}</Text>
            {usesServiceAccount && (
                <ProjectsWithoutAiServiceAccountNotice projects={projects} />
            )}
        </MantineModal>
    );
};

export default AgentIdentityRuleConfirmModal;
