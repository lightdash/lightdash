import type { ApiError } from '@lightdash/common';
import {
    Button,
    Loader,
    SegmentedControl,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { IconFolder, IconPlus } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { type FC, useMemo, useState } from 'react';
import { useGitHubRepositories } from '../common/GithubIntegration/hooks/useGithubIntegration';

type Props = {
    onSelectRepo: (repo: {
        owner: string;
        repo: string;
        branch: string;
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
        });
    };

    const handleCreateNew = () => {
        if (!newRepoName.trim()) return;
        createRepoMutation.mutate(newRepoName.trim());
    };

    return (
        <Stack spacing="md">
            <Text>
                Choose an existing repository or create a new one for your dbt
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
                <Stack spacing="sm">
                    <Select
                        label="Repository"
                        placeholder="Search repositories..."
                        data={repoOptions}
                        value={selectedRepoFullName}
                        onChange={setSelectedRepoFullName}
                        searchable
                        nothingFound={
                            isLoadingRepos
                                ? 'Loading...'
                                : 'No repositories found'
                        }
                        rightSection={
                            isLoadingRepos ? <Loader size="xs" /> : null
                        }
                    />
                    <Button
                        leftIcon={<IconFolder size={18} />}
                        onClick={handleSelectExisting}
                        disabled={!selectedRepo}
                    >
                        Continue
                    </Button>
                </Stack>
            ) : (
                <Stack spacing="sm">
                    <TextInput
                        label="Repository name"
                        placeholder="my-dbt-project"
                        value={newRepoName}
                        onChange={(e) => setNewRepoName(e.target.value)}
                        error={
                            createRepoMutation.isError
                                ? createRepoMutation.error?.error?.message
                                : undefined
                        }
                    />
                    <Text size="xs" color="dimmed">
                        A private repository will be created in your GitHub
                        organization.
                    </Text>
                    <Button
                        leftIcon={<IconPlus size={18} />}
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
