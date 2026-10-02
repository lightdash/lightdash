import {
    buildGitDbtConnection,
    GIT_HOST_LABELS,
    supportsNativeLightdashYaml,
    type CreateWarehouseCredentials,
    type GitHost,
    type Project,
} from '@lightdash/common';
import { Button, Group, Stack, Title } from '@mantine/core';
import { useState, type FC } from 'react';
import { useSemanticLayerFormat } from '../../../hooks/useGitHostDiscovery';
import { useUpdateMutation } from '../../../hooks/useProject';
import useApp from '../../../providers/App/useApp';
import Callout from '../../common/Callout';
import { useGithubConfig } from '../../common/GithubIntegration/hooks/useGithubIntegration';
import { FormatCheck } from './FormatCheck';
import { GitHostCredentialsFields } from './GitHostCredentialsFields';
import { RepositoryPicker } from './RepositoryPicker';
import {
    getAutomaticSemanticLayer,
    getEmptyGitHostDraft,
    EMPTY_REPOSITORY_SELECTION,
    toGitHostCredentials,
    type GitHostDraft,
    type RepositorySelection,
    type SemanticLayerChoice,
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
    const detection = useSemanticLayerFormat();

    const credentials = toGitHostCredentials(
        host,
        draft,
        githubConfig.data?.enabled === true,
    );
    const supportsNative =
        credentials !== null && supportsNativeLightdashYaml(credentials);
    const hasRepository =
        credentials !== null &&
        selection.repository !== null &&
        !!selection.branch;
    const canConnect =
        hasRepository &&
        (semanticLayer === null || semanticLayer === 'dbt' || supportsNative);

    const changeSelection = (next: RepositorySelection) => {
        setSelection(next);
        setSemanticLayer(null);
        detection.reset();
    };

    const save = async (choice: SemanticLayerChoice) => {
        if (!credentials || !selection.repository) return;
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
                semanticLayer: choice,
                githubInstallationId: installationId,
            }),
        });
        onSaved();
    };

    const connect = async () => {
        if (semanticLayer) {
            await save(semanticLayer);
            return;
        }
        if (!credentials || !selection.repository) return;
        const format = await detection.mutateAsync({
            credentials,
            repository: selection.repository,
            branch: selection.branch,
            subPath: selection.subPath,
        });
        const choice = getAutomaticSemanticLayer(format, supportsNative);
        if (choice) await save(choice);
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
                format={detection.data}
                error={detection.error}
                supportsNative={supportsNative}
                hostLabel={GIT_HOST_LABELS[host]}
                value={semanticLayer}
                onChange={setSemanticLayer}
            />
            {update.error && (
                <Callout variant="danger">{update.error.error.message}</Callout>
            )}
            <Group justify="space-between">
                <Button variant="subtle" onClick={onBack}>
                    Back
                </Button>
                <Button
                    disabled={!canConnect}
                    loading={detection.isLoading || update.isLoading}
                    onClick={() => void connect().catch(() => undefined)}
                >
                    Connect and deploy
                </Button>
            </Group>
        </Stack>
    );
};
