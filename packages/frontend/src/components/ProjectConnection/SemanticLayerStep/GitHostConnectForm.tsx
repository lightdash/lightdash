import {
    buildGitDbtConnection,
    GIT_HOST_LABELS,
    supportsNativeLightdashYaml,
    type CreateWarehouseCredentials,
    type GitHost,
    type Project,
} from '@lightdash/common';
import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { useState, type FC } from 'react';
import { useUpdateMutation } from '../../../hooks/useProject';
import useApp from '../../../providers/App/useApp';
import { useGithubConfig } from '../../common/GithubIntegration/hooks/useGithubIntegration';
import { FormatCheck, type SemanticLayerChoice } from './FormatCheck';
import { GitHostCredentialsFields } from './GitHostCredentialsFields';
import { RepositoryPicker } from './RepositoryPicker';
import {
    getEmptyGitHostDraft,
    EMPTY_REPOSITORY_SELECTION,
    toGitHostCredentials,
    type GitHostDraft,
    type RepositorySelection,
} from './semanticLayerStepState';

export const GitHostConnectForm: FC<{
    host: GitHost;
    project: Project;
    onBack: () => void;
    onSaved: () => void;
}> = ({ host, project, onBack, onSaved }) => {
    const { health } = useApp();
    const canInstallGithubApp = health.data?.hasGithub === true;
    const githubConfig = useGithubConfig();
    const installationId = githubConfig.data?.installationId ?? null;
    const [draft, setDraft] = useState<GitHostDraft>(() =>
        getEmptyGitHostDraft(canInstallGithubApp),
    );
    const [selection, setSelection] = useState<RepositorySelection>(
        EMPTY_REPOSITORY_SELECTION,
    );
    const [semanticLayer, setSemanticLayer] =
        useState<SemanticLayerChoice | null>(null);
    const update = useUpdateMutation(project.projectUuid);

    const credentials = toGitHostCredentials(
        host,
        draft,
        githubConfig.data?.enabled === true,
    );
    const supportsNative =
        credentials !== null && supportsNativeLightdashYaml(credentials);
    const canSave =
        credentials !== null &&
        selection.repository !== null &&
        !!selection.branch &&
        semanticLayer !== null &&
        (semanticLayer === 'dbt' || supportsNative);

    const changeSelection = (next: RepositorySelection) => {
        setSelection(next);
        setSemanticLayer(null);
    };

    const save = async () => {
        if (!credentials || !selection.repository || !semanticLayer) return;
        await update.mutateAsync({
            name: project.name,
            dbtVersion: project.dbtVersion,
            warehouseConnection:
                project.warehouseConnection as CreateWarehouseCredentials,
            organizationWarehouseCredentialsUuid:
                project.organizationWarehouseCredentialsUuid,
            dbtConnection: buildGitDbtConnection({
                credentials,
                repository: selection.repository,
                branch: selection.branch,
                subPath: selection.subPath,
                semanticLayer,
                githubInstallationId: installationId,
            }),
        });
        onSaved();
    };

    return (
        <Stack gap="lg">
            <Title order={4}>Connect {GIT_HOST_LABELS[host]}</Title>
            <GitHostCredentialsFields
                host={host}
                draft={draft}
                onChange={setDraft}
                hasGithubInstallation={githubConfig.data?.enabled === true}
                canInstallGithubApp={canInstallGithubApp}
            />
            <RepositoryPicker
                credentials={credentials}
                selection={selection}
                onChange={changeSelection}
            />
            <FormatCheck
                credentials={credentials}
                selection={selection}
                supportsNative={supportsNative}
                hostLabel={GIT_HOST_LABELS[host]}
                value={semanticLayer}
                onChange={setSemanticLayer}
            />
            {update.error && (
                <Text size="sm" c="red">
                    {update.error.error.message}
                </Text>
            )}
            <Group justify="space-between">
                <Button variant="subtle" onClick={onBack}>
                    Back
                </Button>
                <Button
                    disabled={!canSave}
                    loading={update.isLoading}
                    onClick={() => void save().catch(() => undefined)}
                >
                    Connect and deploy
                </Button>
            </Group>
        </Stack>
    );
};
