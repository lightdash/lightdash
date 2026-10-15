import { DbtProjectType } from '@lightdash/common';
import { TextInput, Anchor, PasswordInput } from '@mantine/core';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useFormContext } from '../formContext';
import DbtVersionSelect from '../Inputs/DbtVersion';
import { useProjectFormContext } from '../useProjectFormContext';
import { gitlabDefaultValues } from './defaultValues';
import { ProjectSubPathDescription } from './ProjectSubPathDescription';

const GitlabForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { t } = useTranslation('projectConnection');
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.GITLAB;
    const form = useFormContext();
    return (
        <>
            <PasswordInput
                {...form.getInputProps('dbt.personal_access_token')}
                label={t('dbtForms.personalAccessToken')}
                description={
                    <>
                        <p>
                            <Trans
                                t={t}
                                i18nKey="dbtForms.gitlab.tokenDescription"
                                components={{
                                    docsLink: (
                                        <Anchor
                                            inherit
                                            target="_blank"
                                            href="https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html"
                                            rel="noreferrer"
                                        />
                                    ),
                                }}
                            />
                        </p>
                        <p>{t('dbtForms.gitlab.tokenScope')}</p>
                    </>
                }
                required={requireSecrets}
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
            <DbtVersionSelect disabled={disabled} />

            <TextInput
                label={t('dbtForms.branch')}
                description={
                    <>
                        <p>
                            <Trans
                                t={t}
                                i18nKey="dbtForms.branchDescription"
                                values={{ provider: 'Gitlab' }}
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
                {...form.getInputProps('dbt.branch')}
                disabled={disabled}
                defaultValue={gitlabDefaultValues.branch}
            />
            <TextInput
                label={t('dbtForms.projectSubPath')}
                description={<ProjectSubPathDescription provider="GitLab" />}
                required
                {...form.getInputProps('dbt.project_sub_path')}
                disabled={disabled}
                defaultValue={gitlabDefaultValues.project_sub_path}
            />
            <TextInput
                label={t('dbtForms.gitlab.hostDomain')}
                description={
                    <p>
                        <Trans
                            t={t}
                            i18nKey="dbtForms.gitlab.hostDomainDescription"
                            components={{
                                domainLink: (
                                    <Anchor
                                        inherit
                                        href="http://gitlab.io/"
                                        target="_blank"
                                        rel="noreferrer"
                                    />
                                ),
                            }}
                        />
                    </p>
                }
                disabled={disabled}
                {...form.getInputProps('dbt.host_domain')}
                defaultValue={gitlabDefaultValues.host_domain}
            />
        </>
    );
};

export default GitlabForm;
