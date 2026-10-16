import { DbtProjectType, type DbtGithubProjectConfig } from '@lightdash/common';
import {
    TextInput,
    Button,
    Group,
    Stack,
    Text,
    ActionIcon,
    Anchor,
    Select,
    PasswordInput,
    Avatar,
    Tooltip,
} from '@mantine/core';
import { useInterval } from '@mantine/hooks';
import { IconCheck, IconRefresh } from '@tabler/icons-react';
import React, { useEffect, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import useToaster from '../../../hooks/toaster/useToaster';
import githubIcon from '../../../svgs/github-icon.svg';
import {
    useGithubConfig,
    useGitHubRepositories,
} from '../../common/GithubIntegration/hooks/useGithubIntegration';
import MantineIcon from '../../common/MantineIcon';
import { SelectWithFooter } from '../../common/Select/SelectWithFooter';
import { useFormContext } from '../formContext';
import DbtVersionSelect from '../Inputs/DbtVersion';
import { useProjectFormContext } from '../useProjectFormContext';
import { githubDefaultValues } from './defaultValues';
import styles from './GithubForm.module.css';

const GITHUB_INSTALL_URL = `/api/v1/github/install`;

const GithubLoginForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { t } = useTranslation('projectConnection');
    const form = useFormContext();
    const { data: config, refetch } = useGithubConfig();
    const {
        data: repos,
        isError,
        refetch: refetchRepos,
    } = useGitHubRepositories();
    const isValidGithubInstallation =
        config?.installationId !== undefined && !isError;

    useEffect(() => {
        if (
            config?.installationId &&
            form.values.dbt.type === DbtProjectType.GITHUB &&
            form.values.dbt.installation_id != config.installationId
        ) {
            form.setFieldValue('dbt.installation_id', config.installationId);
        }
    }, [config?.installationId, form]);

    const { showToastSuccess } = useToaster();
    const installationPolling = useInterval(() => {
        void refetch()
            .then((status) => {
                if (status.status === 'success' && status.data.installationId) {
                    showToastSuccess({
                        title: t('dbtForms.github.connected'),
                    });
                    installationPolling.stop();
                    void refetchRepos();
                }
            })
            .catch(() => {});
    }, 2000);

    const repositoryField = form.getInputProps('dbt.repository');

    if (isValidGithubInstallation) {
        return (
            <>
                {repos && repos.length > 0 && (
                    <Group gap="xs">
                        <SelectWithFooter
                            name="dbt.repository"
                            searchable
                            required
                            w="90%"
                            label={t('dbtForms.repository')}
                            placeholder={t('dbtForms.github.selectRepository')}
                            disabled={disabled}
                            data={repos.map((repo) => ({
                                value: repo.fullName,
                                label: repo.fullName,
                            }))}
                            footer={
                                <Tooltip
                                    position="left"
                                    w={300}
                                    label={t(
                                        'dbtForms.github.configureTooltip',
                                    )}
                                >
                                    <Text
                                        c="dimmed"
                                        size="xs"
                                        px="sm"
                                        p="xxs"
                                        className={styles.repositoryHint}
                                        onClick={() =>
                                            window.open(
                                                `https://github.com/settings/installations/${config?.installationId}`,
                                                '_blank',
                                            )
                                        }
                                    >
                                        <Trans
                                            t={t}
                                            i18nKey="dbtForms.github.missingRepository"
                                            components={{
                                                configureLink: (
                                                    <Anchor inherit />
                                                ),
                                            }}
                                        />
                                    </Text>
                                </Tooltip>
                            }
                            {...repositoryField}
                            value={repositoryField.value}
                            onChange={(value) => {
                                if (value === 'configure') {
                                    window.open(
                                        `https://github.com/settings/installations/${config?.installationId}`,
                                        '_blank',
                                    );
                                    return;
                                }
                                repositoryField.onChange(value);
                            }}
                        />

                        <Tooltip
                            label={t('dbtForms.github.refreshRepositories')}
                        >
                            <ActionIcon
                                mt="lg"
                                onClick={() => refetchRepos()}
                                disabled={!isValidGithubInstallation}
                            >
                                <MantineIcon icon={IconRefresh} color="gray" />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                )}
            </>
        );
    }

    return (
        <>
            {' '}
            <Button
                leftSection={
                    <Avatar
                        src={githubIcon}
                        size="sm"
                        alt=""
                        classNames={{ image: styles.githubButtonLogo }}
                    />
                }
                className={styles.githubButton}
                onClick={() => {
                    window.open(
                        GITHUB_INSTALL_URL,
                        '_blank',
                        'popup=true,width=600,height=700',
                    );
                    installationPolling.start();
                }}
            >
                {t('dbtForms.github.signIn')}
            </Button>
            {form.errors['dbt.installation_id'] && (
                <Text c="red" fz="xs">
                    {form.errors['dbt.installation_id']}
                </Text>
            )}
            <TextInput
                label={t('dbtForms.repository')}
                readOnly
                description={t('dbtForms.github.loginFirst')}
                required
                styles={(theme) => ({
                    // Make it look disabled
                    input: {
                        backgroundColor: theme.colors.ldGray[1],
                        cursor: 'not-allowed',
                        pointerEvents: 'none',
                    },
                })}
                autoComplete="off"
                value="" // Don't allow writting in this field
            />
        </>
    );
};

const GithubPersonalAccessTokenForm: FC<{ disabled: boolean }> = ({
    disabled,
}) => {
    const { t } = useTranslation('projectConnection');
    const { savedProject, isDbtSource } = useProjectFormContext();
    const form = useFormContext();
    const requireSecrets: boolean =
        !isDbtSource &&
        savedProject?.dbtConnection.type !== DbtProjectType.GITHUB;

    return (
        <>
            <PasswordInput
                name="dbt.personal_access_token"
                label={t('dbtForms.personalAccessToken')}
                description={
                    <>
                        {isDbtSource && (
                            <p>{t('dbtForms.github.requiredForPrivate')}</p>
                        )}
                        <p>
                            <Trans
                                t={t}
                                i18nKey="dbtForms.github.tokenDescription"
                                components={{
                                    docsLink: (
                                        <Anchor
                                            inherit
                                            target="_blank"
                                            href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#github"
                                            rel="noreferrer"
                                        />
                                    ),
                                }}
                            />
                        </p>
                    </>
                }
                required={requireSecrets}
                {...form.getInputProps('dbt.personal_access_token')}
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                disabled={disabled}
            />
            <TextInput
                label={t('dbtForms.repository')}
                description={
                    <p>
                        <Trans
                            t={t}
                            i18nKey="dbtForms.github.repositoryFormat"
                            components={{ b: <b /> }}
                        />
                    </p>
                }
                required
                {...form.getInputProps('dbt.repository')}
                disabled={disabled}
                placeholder="org/project"
            />
        </>
    );
};

const GithubForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { t } = useTranslation('projectConnection');
    const { savedProject, isDbtSource } = useProjectFormContext();
    const form = useFormContext();
    const { data: githubConfig } = useGithubConfig();

    if (form.values.dbt.type !== DbtProjectType.GITHUB) {
        throw new Error('GithubForm can only be used for Github projects');
    }

    const isNative = form.values.dbt.semanticLayer === 'lightdash';

    const formAuthorizationMethod = form.values.dbt?.authorization_method;
    // Saved connections always carry a method (the API normalises legacy
    // rows), so only a brand-new form can be missing one. The old fallback on
    // savedProject.personal_access_token never fired: the API strips secrets.
    const authorizationMethod: DbtGithubProjectConfig['authorization_method'] =
        formAuthorizationMethod ?? 'installation_id';

    useEffect(() => {
        if (formAuthorizationMethod !== authorizationMethod) {
            form.setFieldValue('dbt.authorization_method', authorizationMethod);
        }
    }, [authorizationMethod, formAuthorizationMethod, form]);

    const isInstallationValid =
        githubConfig?.enabled && authorizationMethod === 'installation_id';

    return (
        <>
            <Stack mt="xs">
                {!isDbtSource && (
                    <Select
                        label={t('dbtForms.github.semanticLayerFormat')}
                        name="dbt.semanticLayer"
                        value={form.values.dbt.semanticLayer ?? 'dbt'}
                        allowDeselect={false}
                        disabled={disabled}
                        data={[
                            { value: 'dbt', label: 'dbt' },
                            {
                                value: 'lightdash',
                                label: t('dbtForms.github.nativeYaml'),
                            },
                        ]}
                        onChange={(value) => {
                            if (value !== 'dbt' && value !== 'lightdash')
                                return;
                            if (form.values.dbt.type !== DbtProjectType.GITHUB)
                                return;
                            form.setFieldValue('dbt', {
                                ...form.values.dbt,
                                semanticLayer: value,
                                ...(value === 'lightdash'
                                    ? {
                                          target: undefined,
                                          selector: undefined,
                                          environment: undefined,
                                      }
                                    : {}),
                            });
                        }}
                    />
                )}
                <Group gap="sm">
                    <Select
                        allowDeselect={false}
                        name="dbt.authorization_method"
                        {...form.getInputProps('dbt.authorization_method')}
                        defaultValue={
                            // If installation is not valid, we still show personal_access_token on existing saved projects
                            isInstallationValid || savedProject === undefined
                                ? 'installation_id'
                                : 'personal_access_token'
                        }
                        description={
                            isInstallationValid ? (
                                <>
                                    <Trans
                                        t={t}
                                        i18nKey="dbtForms.github.connectedDescription"
                                        components={{
                                            accountLink: (
                                                <Anchor
                                                    inherit
                                                    href="/generalSettings/integrations"
                                                    target="_blank"
                                                />
                                            ),
                                        }}
                                    />
                                </>
                            ) : undefined
                        }
                        w={isInstallationValid ? '90%' : '100%'}
                        label={t('dbtForms.github.authorizationMethod')}
                        data={[
                            {
                                value: 'installation_id',
                                label: t('dbtForms.github.oauth'),
                            },
                            {
                                value: 'personal_access_token',
                                label: t('dbtForms.github.pat'),
                            },
                        ]}
                        disabled={disabled}
                    />

                    {isInstallationValid && (
                        <Tooltip label={t('dbtForms.github.connectedTooltip')}>
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

                {!isNative && <DbtVersionSelect disabled={disabled} />}
                <TextInput
                    name="dbt.branch"
                    {...form.getInputProps('dbt.branch')}
                    label={t('dbtForms.branch')}
                    description={
                        <>
                            <p>
                                <Trans
                                    t={t}
                                    i18nKey="dbtForms.branchDescription"
                                    values={{ provider: 'GitHub' }}
                                    components={{ b: <b /> }}
                                />
                            </p>
                            <p>
                                <Trans
                                    t={t}
                                    i18nKey="dbtForms.branchDefault"
                                    components={{ b: <b /> }}
                                />
                            </p>
                        </>
                    }
                    required
                    defaultValue={githubDefaultValues.branch}
                    disabled={disabled}
                />
                <TextInput
                    name="dbt.project_sub_path"
                    {...form.getInputProps('dbt.project_sub_path')}
                    label={t('dbtForms.projectSubPath')}
                    description={
                        isNative ? (
                            <Text size="sm">
                                {t('dbtForms.github.nativeSubPath')}
                            </Text>
                        ) : (
                            <>
                                <p>
                                    <Trans
                                        t={t}
                                        i18nKey="dbtForms.subPathRoot"
                                        values={{
                                            example:
                                                'lightdash/lightdash-analytics/dbt_project.yml',
                                        }}
                                        components={{ b: <b /> }}
                                    />
                                </p>
                                <p>
                                    <Trans
                                        t={t}
                                        i18nKey="dbtForms.subPathNested"
                                        values={{
                                            example:
                                                'lightdash/lightdash-analytics/dbt/dbt_project.yml',
                                        }}
                                        components={{ b: <b /> }}
                                    />
                                </p>
                            </>
                        )
                    }
                    required
                    disabled={disabled}
                    defaultValue={githubDefaultValues.project_sub_path}
                />
                <TextInput
                    name="dbt.host_domain"
                    {...form.getInputProps('dbt.host_domain')}
                    label={t('dbtForms.github.hostDomain')}
                    description={t('dbtForms.github.hostDomainDescription')}
                    disabled={disabled}
                    defaultValue={githubDefaultValues.host_domain}
                />
            </Stack>
        </>
    );
};

export default GithubForm;
