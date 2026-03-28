import {
    type ApiCreateProjectResults,
    type ApiError,
    BigqueryAuthenticationType,
    DbtProjectType,
    ProjectType,
    SupportedDbtVersions,
    WarehouseTypes,
} from '@lightdash/common';
import { Alert, Button, Stack, Text, TextInput } from '@mantine/core';
import { IconCheck, IconRocket } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { type FC, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../common/MantineIcon';

type Props = {
    selectedRepo: { owner: string; repo: string; branch: string } | null;
    gcpProjectId: string;
};

// Create project without compile/test - just creates the record
const createProjectWithoutCompile = async (data: {
    name: string;
    type: ProjectType;
    dbtConnection: {
        type: DbtProjectType.GITHUB;
        repository: string;
        branch: string;
        project_sub_path: string;
        authorization_method: 'installation_id';
    };
    warehouseConnection: {
        type: WarehouseTypes.BIGQUERY;
        authenticationType: BigqueryAuthenticationType;
        keyfileContents: Record<string, string>;
        project: string;
        dataset: string;
        location: string | undefined;
        timeoutSeconds: number;
        priority: 'interactive' | 'batch';
        retries: number;
        maximumBytesBilled: number;
    };
    dbtVersion: SupportedDbtVersions;
}): Promise<ApiCreateProjectResults> => {
    const response = await fetch('/api/v1/org/projects', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw {
            status: 'error',
            error: errorData.error || {
                name: 'Error',
                statusCode: response.status,
                message: 'Failed to create project',
            },
        } as ApiError;
    }

    const result = await response.json();
    return result.results;
};

export const OnboardingCreateProjectStep: FC<Props> = ({
    selectedRepo,
    gcpProjectId,
}) => {
    const navigate = useNavigate();
    // Prefill project name with repo name
    const [projectName, setProjectName] = useState(selectedRepo?.repo || '');

    // Update project name if selectedRepo changes
    useEffect(() => {
        if (selectedRepo?.repo) {
            setProjectName(selectedRepo.repo);
        }
    }, [selectedRepo?.repo]);

    const createProjectMutation = useMutation<
        ApiCreateProjectResults,
        ApiError,
        Parameters<typeof createProjectWithoutCompile>[0]
    >({
        mutationFn: createProjectWithoutCompile,
        onSuccess: (data) => {
            // Navigate to the new project
            void navigate(`/projects/${data.project.projectUuid}/home`);
        },
    });

    const handleCreateProject = () => {
        if (!projectName.trim()) return;
        if (!selectedRepo) return;

        createProjectMutation.mutate({
            name: projectName.trim(),
            type: ProjectType.DEFAULT,
            dbtConnection: {
                type: DbtProjectType.GITHUB,
                repository: `${selectedRepo.owner}/${selectedRepo.repo}`,
                branch: selectedRepo.branch,
                project_sub_path: '/',
                authorization_method: 'installation_id',
            },
            warehouseConnection: {
                type: WarehouseTypes.BIGQUERY,
                authenticationType: BigqueryAuthenticationType.SSO,
                // Backend will auto-populate keyfileContents from user's refresh token
                keyfileContents: {},
                project: gcpProjectId,
                dataset: '', // Not required for now
                location: undefined,
                timeoutSeconds: 300,
                priority: 'interactive',
                retries: 3,
                maximumBytesBilled: 1000000000,
            },
            dbtVersion: SupportedDbtVersions.V1_8,
        });
    };

    if (createProjectMutation.isSuccess) {
        return (
            <Stack spacing="md" align="center" py="xl">
                <MantineIcon icon={IconCheck} color="green" size={60} />
                <Text fw={500} size="lg">
                    Project created!
                </Text>
                <Text color="dimmed">Redirecting to your new project...</Text>
            </Stack>
        );
    }

    return (
        <Stack spacing="md">
            <Text>Almost there! Confirm your Lightdash project name.</Text>

            {selectedRepo && (
                <Alert color="blue" variant="light">
                    <Text size="sm">
                        <strong>Repository:</strong> {selectedRepo.owner}/
                        {selectedRepo.repo} ({selectedRepo.branch})
                    </Text>
                    <Text size="sm">
                        <strong>GCP Project:</strong> {gcpProjectId}
                    </Text>
                </Alert>
            )}

            <TextInput
                label="Lightdash project name"
                placeholder="My Analytics Project"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                error={
                    createProjectMutation.isError
                        ? createProjectMutation.error?.error?.message
                        : undefined
                }
            />

            <Button
                leftIcon={<IconRocket size={18} />}
                onClick={handleCreateProject}
                disabled={!projectName.trim() || !selectedRepo}
                loading={createProjectMutation.isLoading}
                size="lg"
            >
                Create Project
            </Button>

            <Text size="xs" color="dimmed">
                Your project will be created with BigQuery as the data warehouse
                and connected to your GitHub repository. You can add dbt models
                to your repository to start exploring your data.
            </Text>
        </Stack>
    );
};
