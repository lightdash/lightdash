import { DbtProjectType } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Avatar,
    Button,
    Group,
    PasswordInput,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import React, { useEffect, type FC } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import githubIcon from '../../../svgs/github-icon.svg';
import {
    hasNoWhiteSpaces,
    isGitRepository,
    isValidGithubToken,
    startWithSlash,
} from '../../../utils/fieldValidators';
import {
    useGithubInstallationId,
    useGitHubRepositories,
} from '../../common/GithubIntegration/hooks/useGithubIntegration';
import MantineIcon from '../../common/MantineIcon';
import { useProjectFormContext } from '../useProjectFormContext';
import DbtVersionSelect from '../WarehouseForms/Inputs/DbtVersion';

const GITHUB_INSTALL_URL = `/api/v1/github/install`;

const GithubLoginForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { register } = useFormContext();
    const { data: config, refetch } = useGithubInstallationId();
    const {
        data: repos,
        isError,
        refetch: refetchRepos,
    } = useGitHubRepositories();
    const isValidGithubInstallation =
        config?.installationId !== undefined && !isError;
    const repository = useWatch({ name: 'dbt.repository' });

    useEffect(() => {
        if (config?.installationId) {
            register('dbt.installation_id', { value: config?.installationId });
        }
    }, [config?.installationId, register]);

    useEffect(() => {
        if (repos && repos.length > 0) {
            if (repository === undefined) {
                register('dbt.repository', { value: repos[0].fullName });
            }
        }
    }, [repos, register, repository]);
    return (
        <>
            {isValidGithubInstallation ? (
                <>
                    {' '}
                    <Text
                        sx={(theme) => ({
                            transition: 'color 0.3s ease',
                            animation: 'fadeGreen 3s',
                            '@keyframes fadeGreen': {
                                '0%': { color: theme.colors.green[4] },
                                '100%': { color: 'inherit' },
                            },
                        })}
                    >
                        You are connected to GitHub, click{' '}
                        <Anchor
                            href={'/generalSettings/integrations'}
                            target="_blank"
                        >
                            here
                        </Anchor>{' '}
                        to use another account
                    </Text>
                    {repos && repos.length > 0 && (
                        <Group spacing="xs">
                            <Controller
                                name="dbt.repository"
                                render={({ field }) => (
                                    <Select
                                        searchable
                                        required
                                        w="90%"
                                        name={field.name}
                                        label="Repository"
                                        disabled={
                                            disabled ||
                                            !isValidGithubInstallation
                                        }
                                        data={repos.map((repo) => ({
                                            value: repo.fullName,
                                            label: repo.fullName,
                                        }))}
                                        defaultValue={repos[0].fullName}
                                        value={field.value}
                                        onChange={field.onChange}
                                    />
                                )}
                            />
                            <Tooltip label="Refresh repositories after updating access on Github">
                                <ActionIcon
                                    mt="20px"
                                    onClick={() => refetchRepos()}
                                    disabled={!isValidGithubInstallation}
                                >
                                    <MantineIcon
                                        icon={IconRefresh}
                                        color="gray"
                                    />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                    )}
                    {isValidGithubInstallation && (
                        <Text>
                            {' '}
                            Don't see your repository?{' '}
                            <Anchor
                                href={`https://github.com/settings/installations/${config?.installationId}`}
                                target="_blank"
                            >
                                {' '}
                                Click here to configure your GitHub integration
                            </Anchor>
                        </Text>
                    )}
                </>
            ) : (
                <>
                    {' '}
                    <Button
                        leftIcon={
                            <Avatar
                                src={githubIcon}
                                size="sm"
                                styles={{ image: { filter: 'invert(1)' } }}
                            />
                        }
                        sx={() => ({
                            backgroundColor: 'black',
                            color: 'white',
                            '&:hover': {
                                backgroundColor: 'gray.8',
                            },
                        })}
                        onClick={() => {
                            window.open(
                                GITHUB_INSTALL_URL,
                                '_blank',
                                'popup=true,width=600,height=700',
                            );
                            // Poll the API to check if the installation is successful
                            const interval = setInterval(() => {
                                refetch()
                                    .then((s) => {
                                        if (s.status === 'success') {
                                            clearInterval(interval);
                                            void refetchRepos();
                                        }
                                    })
                                    .catch(() => {});
                            }, 2000);
                        }}
                    >
                        Sign in with GitHub
                    </Button>
                </>
            )}
        </>
    );
};

const GithubPersonalAccessTokenForm: FC<{ disabled: boolean }> = ({
    disabled,
}) => {
    const { savedProject } = useProjectFormContext();
    const { register } = useFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.GITHUB;

    return (
        <>
            <PasswordInput
                label="Personal access token"
                description={
                    <p>
                        This is used to access your repo.
                        <Anchor
                            target="_blank"
                            href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#github"
                            rel="noreferrer"
                        >
                            {' '}
                            Click to open documentation
                        </Anchor>
                        .
                    </p>
                }
                required={requireSecrets}
                {...register('dbt.personal_access_token', {
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces(
                            'Personal access token',
                        ),
                        isValidGithubToken: isValidGithubToken(
                            'Personal access token',
                        ),
                    },
                })}
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                disabled={disabled}
            />
            <TextInput
                label="Repository"
                description={
                    <p>
                        This should be in the format <b>my-org/my-repo</b>. e.g.{' '}
                        <b>lightdash/lightdash-analytics</b>
                    </p>
                }
                required
                {...register('dbt.repository', {
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Repository'),
                        isGitRepository: isGitRepository('Repository'),
                    },
                })}
                disabled={disabled}
                placeholder="org/project"
            />
        </>
    );
};
const GithubForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { savedProject } = useProjectFormContext();
    const { register } = useFormContext();

    const authorizationMethod: string = useWatch({
        name: 'dbt.authorization_method',
        defaultValue:
            savedProject?.dbtConnection.type === DbtProjectType.GITHUB &&
            savedProject?.dbtConnection?.personal_access_token !== undefined
                ? 'personal-access-token'
                : 'oauth',
    });

    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <Controller
                    name="dbt.authorization_method"
                    defaultValue="oauth"
                    render={({ field }) => (
                        <Select
                            name={field.name}
                            label="Authorization method"
                            data={[
                                {
                                    value: 'oauth',
                                    label: 'OAuth (recommended)',
                                },
                                {
                                    value: 'personal-access-token',
                                    label: 'Personal Access Token',
                                },
                            ]}
                            value={field.value}
                            onChange={field.onChange}
                            disabled={disabled}
                        />
                    )}
                />
                {authorizationMethod === 'oauth' ? (
                    <GithubLoginForm disabled={disabled} />
                ) : (
                    <GithubPersonalAccessTokenForm disabled={disabled} />
                )}

                <DbtVersionSelect disabled={disabled} />
                <TextInput
                    label="Branch"
                    description={
                        <>
                            <p>
                                This is the branch in your GitHub repo that
                                Lightdash should sync to. e.g. <b>main</b>,{' '}
                                <b>master</b> or <b>dev</b>
                            </p>
                            <p>
                                By default, we've set this to <b>main</b> but
                                you can change it to whatever you'd like.
                            </p>
                        </>
                    }
                    required
                    {...register('dbt.branch', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('Branch'),
                        },
                    })}
                    disabled={disabled}
                    defaultValue="main"
                />
                <TextInput
                    label="Project directory path"
                    description={
                        <>
                            <p>
                                Put <b>/</b> if your <b>dbt_project.yml</b> file
                                is in the main folder of your repo (e.g.
                                lightdash/lightdash-analytics/dbt_project.yml).
                            </p>
                            <p>
                                Include the path to the sub-folder where your
                                dbt project is if your dbt project is in a
                                sub-folder in your repo. For example, if my
                                project was in
                                lightdash/lightdash-analytics/dbt/dbt_project.yml,
                                I'd write <b>/dbt</b> in this field.
                            </p>
                        </>
                    }
                    required
                    {...register('dbt.project_sub_path', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces(
                                'Project directory path',
                            ),
                            startWithSlash: startWithSlash(
                                'Project directory path',
                            ),
                        },
                    })}
                    disabled={disabled}
                    defaultValue="/"
                />
                <TextInput
                    label="Host domain (for Github Enterprise)"
                    description="If you've customized the domain for your Github, you can add the custom domain for your project in here."
                    disabled={disabled}
                    defaultValue="github.com"
                    {...register('dbt.host_domain')}
                />
            </Stack>
        </>
    );
};

export default GithubForm;
