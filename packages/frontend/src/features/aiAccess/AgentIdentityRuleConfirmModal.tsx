import { type AiIdentitySource, type WarehouseTypes } from '@lightdash/common';
import { Anchor, Button, Group, Loader, Text } from '@mantine/core';
import { type TFunction } from 'i18next';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
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
    t: TFunction,
) => {
    const key =
        source === 'ai_service_account' ? 'sharedAccount' : 'markedPerson';
    return {
        title: t(`ruleConfirm.${key}.title`, { warehouse: warehouseName }),
        body: t(`ruleConfirm.${key}.body`, { warehouse: warehouseName }),
        confirmLabel: t(`ruleConfirm.${key}.confirm`),
    };
};

const ProjectsWithoutAiServiceAccountNotice = ({
    projects,
}: {
    projects: ReturnType<typeof useProjectsWithoutAiServiceAccount>;
}) => {
    const { t } = useTranslation('aiAccess');
    if (projects.isFetching) {
        return <Loader size="sm" aria-label={t('ruleConfirm.checking')} />;
    }

    if (projects.isError) {
        return (
            <Group gap="xs">
                <Text size="sm" c="dimmed">
                    {t('ruleConfirm.checkFailed')}
                </Text>
                <Button
                    variant="default"
                    size="xs"
                    onClick={() => void projects.refetch()}
                >
                    {t('actions.retry', { ns: 'common' })}
                </Button>
            </Group>
        );
    }

    const missingProjects = projects.data ?? [];
    if (missingProjects.length === 0) return null;

    return (
        <Callout variant="warning" color="yellow">
            {t('ruleConfirm.missingPrefix', {
                count: missingProjects.length,
            })}{' '}
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
                t('ruleConfirm.andMore', {
                    count: missingProjects.length - 3,
                })}
            .{' '}
            {t('ruleConfirm.missingSuffix', {
                count: missingProjects.length,
            })}
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
    const { t } = useTranslation('aiAccess');
    const usesServiceAccount = source === 'ai_service_account';
    const projects = useProjectsWithoutAiServiceAccount(
        warehouseType,
        usesServiceAccount,
    );
    const warehouseName =
        identityWarehouseNames[
            warehouseType as keyof typeof identityWarehouseNames
        ];
    const copy = getConfirmationCopy(source, warehouseName, t);
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
