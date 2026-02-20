import type { ApiError } from '@lightdash/common';
import {
    Button,
    Loader,
    SegmentedControl,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { IconFolder, IconPlus } from '@tabler/icons-react';
import MantineIcon from '../common/MantineIcon';
import { useMutation } from '@tanstack/react-query';
import { type FC, useMemo, useState } from 'react';
import { useGitHubRepositories } from '../common/GithubIntegration/hooks/useGithubIntegration';

type Props = {
    onSelectRepo: (repo: {
        owner: string;
        repo: string;
        branch: string;
        isNewRepo: boolean;
    }) => void;
};

type CreateRepoResponse = {
    owner: string;
    repo: string;
    fullName: string;
    defaultBranch: string;
};

const createGithubRepo = async (name: string): Promise<CreateRepoResponse> => {
    const response = await fetch('/api/v1/github/repos', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, isPrivate: true }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw {
            status: 'error',
            error: errorData.error || {
                name: 'Error',
                statusCode: response.status,
                message: 'Failed to create repository',
            },
        } as ApiError;
    }

    const data = await response.json();
    return data.results;
};

export const OnboardingRepoStep: FC<Props> = ({ onSelectRepo }) => {
    const [mode, setMode] = useState<'select' | 'create'>('select');
    const [selectedRepoFullName, setSelectedRepoFullName] = useState<
        string | null
    >(null);
    const [newRepoName, setNewRepoName] = useState('');

    // Fetch all repos (backend paginates internally)
    const { data: repositories, isLoading: isLoadingRepos } =
        useGitHubRepositories();

    const createRepoMutation = useMutation<
        CreateRepoResponse,
        ApiError,
        string
    >({
        mutationFn: createGithubRepo,
        onSuccess: (data) => {
            onSelectRepo({
                owner: data.owner,
                repo: data.repo,
                branch: data.defaultBranch,
                isNewRepo: true,
            });
        },
    });

    const repoOptions = useMemo(
        () =>
            repositories?.map((repo) => ({
                value: repo.fullName,
                label: repo.fullName,
            })) || [],
        [repositories],
    );

    // Find selected repo from data
    const selectedRepo = useMemo(
        () => repositories?.find((r) => r.fullName === selectedRepoFullName),
        [repositories, selectedRepoFullName],
    );

    const handleSelectExisting = () => {
        if (!selectedRepo) return;
        onSelectRepo({
            owner: selectedRepo.ownerLogin,
            repo: selectedRepo.name,
            branch: selectedRepo.defaultBranch,
            isNewRepo: false,
        });
    };

    const handleCreateNew = () => {
        if (!newRepoName.trim()) return;
        createRepoMutation.mutate(newRepoName.trim());
    };

    return (
        <Stack gap="md">
            <Text>
                Choose an existing repository or create a new one for your
                project.
            </Text>

            <SegmentedControl
                value={mode}
                onChange={(value) => setMode(value as 'select' | 'create')}
                data={[
                    { label: 'Select existing', value: 'select' },
                    { label: 'Create new', value: 'create' },
                ]}
            />

            {mode === 'select' ? (
                <Stack gap="sm">
                    <Select
                        label="Repository"
                        placeholder="Search repositories..."
                        data={repoOptions}
                        value={selectedRepoFullName}
                        onChange={setSelectedRepoFullName}
                        searchable
                        nothingFoundMessage={
                            isLoadingRepos
                                ? 'Loading...'
                                : 'No repositories found'
                        }
                        rightSection={
                            isLoadingRepos ? <Loader size="xs" /> : null
                        }
                    />
                    <Button
                        leftSection={<MantineIcon icon={IconFolder} />}
                        onClick={handleSelectExisting}
                        disabled={!selectedRepo}
                    >
                        Continue
                    </Button>
                </Stack>
            ) : (
                <Stack gap="sm">
                    <TextInput
                        label="Repository name"
                        placeholder="my-analytics-project"
                        value={newRepoName}
                        onChange={(e) => setNewRepoName(e.target.value)}
                        error={
                            createRepoMutation.isError
                                ? createRepoMutation.error?.error?.message
                                : undefined
                        }
                    />
                    <Text size="xs" c="dimmed">
                        A private repository will be created in your GitHub
                        organization.
                    </Text>
                    <Button
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={handleCreateNew}
                        disabled={!newRepoName.trim()}
                        loading={createRepoMutation.isLoading}
                    >
                        Create & Continue
                    </Button>
                </Stack>
            )}
        </Stack>
    );
};
