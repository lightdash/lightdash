import { assertUnreachable, GitHost } from '@lightdash/common';
import {
    Anchor,
    Button,
    PasswordInput,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { type FC } from 'react';
import { type GitHostDraft } from './semanticLayerStepState';

const GITHUB_INSTALL_URL = '/api/v1/github/install';

const TOKEN_HELP: Record<GitHost, { scopes: string; createUrl: string }> = {
    [GitHost.GITHUB]: {
        scopes: 'Contents: Read (fine-grained) or the repo scope (classic).',
        createUrl: 'https://github.com/settings/personal-access-tokens/new',
    },
    [GitHost.GITLAB]: {
        scopes: 'read_api and read_repository.',
        createUrl: 'https://gitlab.com/-/user_settings/personal_access_tokens',
    },
    [GitHost.BITBUCKET]: {
        scopes: 'read:repository:bitbucket.',
        createUrl:
            'https://id.atlassian.com/manage-profile/security/api-tokens',
    },
    [GitHost.AZURE_DEVOPS]: {
        scopes: 'Code (Read).',
        createUrl:
            'https://learn.microsoft.com/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate',
    },
};

const TokenField: FC<{
    host: GitHost;
    draft: GitHostDraft;
    onChange: (draft: GitHostDraft) => void;
}> = ({ host, draft, onChange }) => (
    <PasswordInput
        label="Access token"
        required
        description={
            <>
                Needs {TOKEN_HELP[host].scopes}{' '}
                <Anchor
                    href={TOKEN_HELP[host].createUrl}
                    target="_blank"
                    rel="noreferrer"
                    inherit
                >
                    Create a token
                </Anchor>
            </>
        }
        value={draft.token}
        onChange={(event) =>
            onChange({ ...draft, token: event.currentTarget.value })
        }
    />
);

const HostDomainField: FC<{
    draft: GitHostDraft;
    onChange: (draft: GitHostDraft) => void;
    placeholder: string;
}> = ({ draft, onChange, placeholder }) => (
    <TextInput
        label="Host (self-managed only)"
        description="Leave empty for the cloud service."
        placeholder={placeholder}
        value={draft.hostDomain}
        onChange={(event) =>
            onChange({ ...draft, hostDomain: event.currentTarget.value })
        }
    />
);

const GithubFields: FC<{
    draft: GitHostDraft;
    onChange: (draft: GitHostDraft) => void;
    hasGithubInstallation: boolean;
    canInstallGithubApp: boolean;
}> = ({ draft, onChange, hasGithubInstallation, canInstallGithubApp }) => (
    <Stack gap="sm">
        {canInstallGithubApp && (
            <SegmentedControl
                value={draft.githubMethod}
                onChange={(value) =>
                    onChange({
                        ...draft,
                        githubMethod:
                            value === 'token' ? 'token' : 'installation',
                    })
                }
                data={[
                    {
                        value: 'installation',
                        label: 'GitHub App (recommended)',
                    },
                    { value: 'token', label: 'Access token' },
                ]}
            />
        )}
        {draft.githubMethod === 'installation' && !hasGithubInstallation && (
            <Stack gap="xs">
                <Text size="sm" c="dimmed">
                    Install the Lightdash GitHub App on the repositories you
                    want to use, then come back to this page.
                </Text>
                <Button
                    component="a"
                    href={GITHUB_INSTALL_URL}
                    variant="default"
                    w="fit-content"
                >
                    Install the GitHub App
                </Button>
            </Stack>
        )}
        {draft.githubMethod === 'token' && (
            <TokenField
                host={GitHost.GITHUB}
                draft={draft}
                onChange={onChange}
            />
        )}
    </Stack>
);

export const GitHostCredentialsFields: FC<{
    host: GitHost;
    draft: GitHostDraft;
    onChange: (draft: GitHostDraft) => void;
    hasGithubInstallation: boolean;
    canInstallGithubApp: boolean;
}> = ({
    host,
    draft,
    onChange,
    hasGithubInstallation,
    canInstallGithubApp,
}) => {
    switch (host) {
        case GitHost.GITHUB:
            return (
                <GithubFields
                    draft={draft}
                    onChange={onChange}
                    hasGithubInstallation={hasGithubInstallation}
                    canInstallGithubApp={canInstallGithubApp}
                />
            );
        case GitHost.GITLAB:
            return (
                <Stack gap="sm">
                    <TokenField host={host} draft={draft} onChange={onChange} />
                    <HostDomainField
                        draft={draft}
                        onChange={onChange}
                        placeholder="gitlab.example.com"
                    />
                </Stack>
            );
        case GitHost.BITBUCKET:
            return (
                <Stack gap="sm">
                    <TextInput
                        label="Username"
                        required
                        value={draft.username}
                        onChange={(event) =>
                            onChange({
                                ...draft,
                                username: event.currentTarget.value,
                            })
                        }
                    />
                    <TokenField host={host} draft={draft} onChange={onChange} />
                    <HostDomainField
                        draft={draft}
                        onChange={onChange}
                        placeholder="bitbucket.example.com"
                    />
                </Stack>
            );
        case GitHost.AZURE_DEVOPS:
            return (
                <Stack gap="sm">
                    <TextInput
                        label="Organization"
                        required
                        description="The name after dev.azure.com/ in your URL."
                        value={draft.organization}
                        onChange={(event) =>
                            onChange({
                                ...draft,
                                organization: event.currentTarget.value,
                            })
                        }
                    />
                    <TokenField host={host} draft={draft} onChange={onChange} />
                </Stack>
            );
        default:
            return assertUnreachable(host, 'Unknown git host');
    }
};
