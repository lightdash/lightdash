import { DbtProjectType } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Avatar,
    Button,
    Group,
    PasswordInput,
    ScrollArea,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
    type ScrollAreaProps,
} from '@mantine/core';
import { IconCheck, IconRefresh } from '@tabler/icons-react';
import React, { useEffect, type FC, type ReactNode } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import useToaster from '../../../hooks/toaster/useToaster';
import githubIcon from '../../../svgs/github-icon.svg';
import {
    hasNoWhiteSpaces,
    isGitRepository,
    isValidGithubToken,
    startWithSlash,
} from '../../../utils/fieldValidators';
import {
    useGithubConfig,
    useGitHubRepositories,
} from '../../common/GithubIntegration/hooks/useGithubIntegration';
import MantineIcon from '../../common/MantineIcon';
import { useProjectFormContext } from '../useProjectFormContext';
import DbtVersionSelect from '../WarehouseForms/Inputs/DbtVersion';

const GITHUB_INSTALL_URL = `/api/v1/github/install`;

const DropdownComponentOverride = ({
    children,
    installationId,
}: {
    children: ReactNode;
    installationId: string | undefined;
}) => (
    <Stack w="100%" spacing={0}>
        <ScrollArea>{children}</ScrollArea>

        <Tooltip
            withinPortal
            position="left"
            width={300}
            multiline
            label="Click here to open your Github installation page to add more repositories."
        >
            <Text
                color="dimmed"
                size="xs"
                px="sm"
                p="xxs"
                sx={(theme) => ({
                    cursor: 'pointer',
                    borderTop: `1px solid ${theme.colors.gray[2]}`,
                    '&:hover': {
                        backgroundColor: theme.colors.gray[1],
                    },
                })}
                onClick={() =>
                    window.open(
                        `https://github.com/settings/installations/${installationId}`,
                        '_blank',
                    )
                }
            >
                Don't see your repository? <Anchor>Configure here</Anchor>
            </Text>
        </Tooltip>
    </Stack>
);

const GithubLoginForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { register } = useFormContext();
    const { data: config, refetch } = useGithubConfig();
    const {
        data: repos,
        isError,
        refetch: refetchRepos,
    } = useGitHubRepositories();
    const isValidGithubInstallation =
        config?.installationId !== undefined && !isError;

    useEffect(() => {
        if (config?.installationId) {
            register('dbt.installation_id', { value: config?.installationId });
        }
    }, [config?.installationId, register]);
    const { showToastSuccess } = useToaster();

    return (
        <>
            {isValidGithubInstallation ? (
                <>
                    {repos && repos.length > 0 && (
                        <Group spacing="xs">
                            <Controller
                                name="dbt.repository"
                                defaultValue={repos[0].fullName}
                                render={({ field }) => (
                                    <Select
                                        searchable
                                        required
                                        w="90%"
                                        name={field.name}
                                        label={`Repository`}
                                        disabled={disabled}
                                        data={repos.map((repo) => ({
                                            value: repo.fullName,
                                            label: repo.fullName,
                                        }))}
                                        dropdownComponent={({
                                            children,
                                        }: ScrollAreaProps) => (
                                            <DropdownComponentOverride
                                                installationId={
                                                    config?.installationId
                                                }
                                            >
                                                {children}
                                            </DropdownComponentOverride>
                                        )}
                                        value={field.value}
                                        onChange={(value) => {
                                            if (value === 'configure') {
                                                window.open(
                                                    `https://github.com/settings/installations/${config?.installationId}`,
                                                    '_blank',
                                                );
                                                return;
                                            }
                                            field.onChange(value);
                                        }}
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
                                        if (
                                            s.status === 'success' &&
                                            s.data.installationId
                                        ) {
                                            showToastSuccess({
                                                title: 'Successfully connected to GitHub',
                                            });

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
                    <TextInput
                        label="Repository"
                        description={`Login first in order to be able to select a repository`}
                        required
                        sx={(theme) => ({
                            // Make it look disabled
                            input: {
                                backgroundColor: theme.colors.gray[1],
                                cursor: 'not-allowed',
                                pointerEvents: 'none',
                            },
                        })}
                        autoComplete="off"
                        value="" // Don't allow writting in this field
                    />
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
    const { data: githubConfig } = useGithubConfig();

    const authorizationMethod: string = useWatch({
        name: 'dbt.authorization_method',
        defaultValue:
            savedProject?.dbtConnection.type === DbtProjectType.GITHUB &&
            savedProject?.dbtConnection?.personal_access_token !== undefined
                ? 'personal_access_token'
                : 'installation_id',
    });

    const isInstallationValid =
        githubConfig?.enabled && authorizationMethod === 'installation_id';

    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <Group spacing="sm">
                    <Controller
                        name="dbt.authorization_method"
                        defaultValue={
                            // If installation is not valid, we still show personal_access_token on existing saved projects
                            isInstallationValid || savedProject === undefined
                                ? 'installation_id'
                                : 'personal_access_token'
                        }
                        render={({ field }) => (
                            <Select
                                description={
                                    isInstallationValid ? (
                                        <Text>
                                            You are connected to GitHub.{' '}
                                            <Anchor
                                                href="/generalSettings/integrations"
                                                target="_blank"
                                            >
                                                Click here to use another
                                                account
                                            </Anchor>
                                        </Text>
                                    ) : undefined
                                }
                                w={isInstallationValid ? '90%' : '100%'}
                                name={field.name}
                                label="Authorization method"
                                data={[
                                    {
                                        value: 'installation_id',
                                        label: 'OAuth (recommended)',
                                    },
                                    {
                                        value: 'personal_access_token',
                                        label: 'Personal Access Token',
                                    },
                                ]}
                                value={field.value}
                                onChange={field.onChange}
                                disabled={disabled}
                            />
                        )}
                    />
                    {isInstallationValid && (
                        <Tooltip label="You are connected to GitHub">
                            <Group mt="40px">
                                <MantineIcon icon={IconCheck} color="green" />
                            </Group>
                        </Tooltip>
                    )}
                </Group>
                {authorizationMethod === 'installation_id' ? (
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
