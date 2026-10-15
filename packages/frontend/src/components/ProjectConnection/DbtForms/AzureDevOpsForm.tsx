import { DbtProjectType } from '@lightdash/common';
import { TextInput, Anchor, PasswordInput } from '@mantine/core';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useFormContext } from '../formContext';
import DbtVersionSelect from '../Inputs/DbtVersion';
import { useProjectFormContext } from '../useProjectFormContext';
import { azureDevopsDefaultValues } from './defaultValues';
import { ProjectSubPathDescription } from './ProjectSubPathDescription';

const AzureDevOpsForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { t } = useTranslation('projectConnection');
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.AZURE_DEVOPS;
    const form = useFormContext();
    return (
        <>
            <PasswordInput
                name="dbt.personal_access_token"
                {...form.getInputProps('dbt.personal_access_token')}
                label={t('dbtForms.personalAccessToken')}
                description={
                    <>
                        <p>
                            <Trans
                                t={t}
                                i18nKey="dbtForms.azure.tokenDescription"
                                components={{
                                    docsLink: (
                                        <Anchor
                                            inherit
                                            href="https://docs.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops&tabs=Windows"
                                            target="_blank"
                                            rel="noreferrer"
                                        />
                                    ),
                                }}
                            />
                        </p>

                        <p>
                            <Trans
                                t={t}
                                i18nKey="dbtForms.azure.tokenScope"
                                components={{ b: <b /> }}
                            />
                        </p>
                    </>
                }
                required={requireSecrets}
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                disabled={disabled}
            />
            <TextInput
                name="dbt.organization"
                {...form.getInputProps('dbt.organization')}
                label={t('dbtForms.azure.organization')}
                description={t('dbtForms.azure.organizationDescription')}
                required
                disabled={disabled}
            />
            <TextInput
                name="dbt.project"
                {...form.getInputProps('dbt.project')}
                label={t('dbtForms.azure.project')}
                description={t('dbtForms.azure.projectDescription')}
                required
                disabled={disabled}
            />
            <TextInput
                name="dbt.repository"
                {...form.getInputProps('dbt.repository')}
                label={t('dbtForms.repository')}
                description={t('dbtForms.azure.repositoryDescription')}
                required
                disabled={disabled}
            />
            <DbtVersionSelect disabled={disabled} />

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
                                values={{ provider: 'Azure DevOps' }}
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
                defaultValue={azureDevopsDefaultValues.branch}
            />
            <TextInput
                name="dbt.project_sub_path"
                {...form.getInputProps('dbt.project_sub_path')}
                label={t('dbtForms.projectSubPath')}
                description={
                    <ProjectSubPathDescription provider="Azure DevOps" />
                }
                required
                disabled={disabled}
                defaultValue={azureDevopsDefaultValues.project_sub_path}
            />
        </>
    );
};

export default AzureDevOpsForm;
