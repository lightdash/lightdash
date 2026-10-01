import {
    type GitHostCredentials,
    type GitHostRepository,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Group,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { type FC } from 'react';
import {
    useGitHostBranches,
    useGitHostRepositories,
} from '../../../hooks/useGitHostDiscovery';
import {
    EMPTY_REPOSITORY_SELECTION,
    type RepositorySelection,
} from './semanticLayerStepState';

const manualRepository = (fullName: string): GitHostRepository => {
    const parts = fullName.split('/').filter(Boolean);
    const name = parts.at(-1) ?? fullName;
    return {
        id: name,
        owner: parts.slice(0, -1).join('/'),
        name,
        fullName,
        azureProject: parts.length > 1 ? parts[0] : null,
        defaultBranch: null,
    };
};

const ManualFields: FC<{
    selection: RepositorySelection;
    onChange: (selection: RepositorySelection) => void;
}> = ({ selection, onChange }) => (
    <Stack gap="sm">
        <TextInput
            label="Repository"
            required
            description="For example acme/analytics. On Azure DevOps use project/repository."
            value={selection.repository?.fullName ?? ''}
            onChange={(event) =>
                onChange({
                    ...selection,
                    repository: event.currentTarget.value
                        ? manualRepository(event.currentTarget.value)
                        : null,
                })
            }
        />
        <TextInput
            label="Branch"
            required
            value={selection.branch}
            onChange={(event) =>
                onChange({ ...selection, branch: event.currentTarget.value })
            }
        />
    </Stack>
);

const ListedFields: FC<{
    credentials: GitHostCredentials;
    selection: RepositorySelection;
    onChange: (selection: RepositorySelection) => void;
}> = ({ credentials, selection, onChange }) => {
    const repositories = useGitHostRepositories();
    const branches = useGitHostBranches();

    const pickRepository = (fullName: string | null) => {
        const repository =
            repositories.data?.find((repo) => repo.fullName === fullName) ??
            null;
        onChange({
            ...selection,
            repository,
            branch: repository?.defaultBranch ?? '',
        });
        if (repository) {
            branches.mutate({ credentials, repository });
        }
    };

    return (
        <Stack gap="sm">
            <Button
                variant="default"
                w="fit-content"
                loading={repositories.isLoading}
                onClick={() => repositories.mutate(credentials)}
            >
                List repositories
            </Button>
            {repositories.error && (
                <Text size="sm" c="red">
                    {repositories.error.error.message}
                </Text>
            )}
            {repositories.data?.length === 0 && (
                <Text size="sm" c="dimmed">
                    This token cannot see any repositories. Check what it can
                    access, or enter the repository by hand.
                </Text>
            )}
            {!!repositories.data?.length && (
                <Select
                    label="Repository"
                    searchable
                    placeholder="Pick a repository"
                    data={repositories.data.map(({ fullName }) => fullName)}
                    value={selection.repository?.fullName ?? null}
                    onChange={pickRepository}
                />
            )}
            {selection.repository && (
                <Select
                    label="Branch"
                    searchable
                    disabled={branches.isLoading}
                    placeholder={
                        branches.isLoading ? 'Loading branches…' : undefined
                    }
                    data={branches.data ?? []}
                    value={selection.branch || null}
                    onChange={(branch) =>
                        onChange({ ...selection, branch: branch ?? '' })
                    }
                    error={branches.error?.error.message}
                />
            )}
        </Stack>
    );
};

export const RepositoryPicker: FC<{
    credentials: GitHostCredentials | null;
    selection: RepositorySelection;
    onChange: (selection: RepositorySelection) => void;
}> = ({ credentials, selection, onChange }) => (
    <Stack gap="sm">
        {selection.isManual && (
            <ManualFields selection={selection} onChange={onChange} />
        )}
        {!selection.isManual && credentials && (
            <ListedFields
                credentials={credentials}
                selection={selection}
                onChange={onChange}
            />
        )}
        {!selection.isManual && !credentials && (
            <Text size="sm" c="dimmed">
                Fill in the details above to list your repositories.
            </Text>
        )}
        <TextInput
            label="Project path"
            description="The folder that holds your project. Use / for the repository root."
            value={selection.subPath}
            onChange={(event) =>
                onChange({ ...selection, subPath: event.currentTarget.value })
            }
        />
        <Group>
            <Anchor
                component="button"
                type="button"
                size="sm"
                onClick={() =>
                    onChange({
                        ...EMPTY_REPOSITORY_SELECTION,
                        isManual: !selection.isManual,
                    })
                }
            >
                {selection.isManual
                    ? 'Pick from a list instead'
                    : 'Enter the repository by hand'}
            </Anchor>
        </Group>
    </Stack>
);
