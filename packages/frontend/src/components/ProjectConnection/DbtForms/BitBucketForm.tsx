import { DbtProjectType } from '@lightdash/common';
import { TextInput, Text, Anchor, PasswordInput, Select } from '@mantine/core';
import React, { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useFormContext } from '../formContext';
import DbtVersionSelect from '../Inputs/DbtVersion';
import { useProjectFormContext } from '../useProjectFormContext';
import { bitbucketDefaultValues } from './defaultValues';
import { ProjectSubPathDescription } from './ProjectSubPathDescription';

const BitBucketForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { t } = useTranslation('projectConnection');
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.BITBUCKET;
    const form = useFormContext();
    const isNative =
        form.values.dbt.type === DbtProjectType.BITBUCKET &&
        form.values.dbt.semanticLayer === 'lightdash';
    return (
        <>
            <Select
                label={t('dbtForms.github.semanticLayerFormat')}
                description={t('dbtForms.bitbucket.nativeDescription')}
                name="dbt.semanticLayer"
                value={isNative ? 'lightdash' : 'dbt'}
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
                    if (
                        (value !== 'dbt' && value !== 'lightdash') ||
                        form.values.dbt.type !== DbtProjectType.BITBUCKET
                    ) {
                        return;
                    }
                    form.setFieldValue('dbt', {
                        ...form.values.dbt,
                        semanticLayer: value,
                        ...(value === 'lightdash'
                            ? {
                                  target: undefined,
                                  selector: undefined,
                                  environment: undefined,
                                  host_domain: 'bitbucket.org',
                              }
                            : {}),
                    });
                }}
            />
            <TextInput
                name="dbt.username"
                {...form.getInputProps('dbt.username')}
                label={t('dbtForms.bitbucket.username')}
                description={t('dbtForms.bitbucket.usernameDescription')}
                required
                disabled={disabled}
                placeholder={t('dbtForms.bitbucket.usernamePlaceholder')}
            />
            <PasswordInput
                name="dbt.personal_access_token"
                {...form.getInputProps('dbt.personal_access_token')}
                label={t('dbtForms.bitbucket.apiToken')}
                description={
                    <>
                        <Text component="span" display="block" size="xs">
                            <Trans
                                t={t}
                                i18nKey="dbtForms.bitbucket.cloudToken"
                                components={{
                                    docsLink: (
                                        <Anchor
                                            inherit
                                            href="https://support.atlassian.com/bitbucket-cloud/docs/create-an-api-token/"
                                            target="_blank"
                                            rel="noreferrer"
                                        />
                                    ),
                                }}
                            />
                        </Text>
                        {!isNative && (
                            <Text component="span" display="block" size="xs">
                                <Trans
                                    t={t}
                                    i18nKey="dbtForms.bitbucket.serverToken"
                                    components={{
                                        docsLink: (
                                            <Anchor
                                                inherit
                                                href="https://confluence.atlassian.com/bitbucketserver/http-access-tokens-939515499.html"
                                                target="_blank"
                                                rel="noreferrer"
                                            />
                                        ),
                                    }}
                                />
                            </Text>
                        )}
                    </>
                }
                required={requireSecrets}
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                disabled={disabled}
            />
            <TextInput
                name="dbt.repository"
                {...form.getInputProps('dbt.repository')}
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
                disabled={disabled}
                placeholder="org/project"
            />
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
                                values={{ provider: 'Bitbucket' }}
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
                disabled={disabled}
                defaultValue={bitbucketDefaultValues.branch}
            />
            <TextInput
                name="dbt.project_sub_path"
                {...form.getInputProps('dbt.project_sub_path')}
                label={t('dbtForms.projectSubPath')}
                description={
                    isNative ? (
                        t('dbtForms.bitbucket.nativeSubPath')
                    ) : (
                        <ProjectSubPathDescription provider="Bitbucket" />
                    )
                }
                required
                disabled={disabled}
                defaultValue={bitbucketDefaultValues.project_sub_path}
            />
            {!isNative && (
                <TextInput
                    name="dbt.host_domain"
                    {...form.getInputProps('dbt.host_domain')}
                    label={t('dbtForms.gitlab.hostDomain')}
                    description={
                        <p>
                            <Trans
                                t={t}
                                i18nKey="dbtForms.bitbucket.hostDomainDescription"
                                components={{
                                    docsLink: (
                                        <Anchor
                                            inherit
                                            href="https://confluence.atlassian.com/bitbucketserver/specify-the-bitbucket-base-url-776640392.html"
                                            target="_blank"
                                            rel="noreferrer"
                                        />
                                    ),
                                }}
                            />
                        </p>
                    }
                    disabled={disabled}
                    defaultValue={bitbucketDefaultValues.host_domain}
                />
            )}
        </>
    );
};

export default BitBucketForm;
