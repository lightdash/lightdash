import { DbtProjectType } from '@lightdash/common';
import React, { FC } from 'react';
import {
    hasNoWhiteSpaces,
    startWithSlash,
} from '../../../utils/fieldValidators';
import Input from '../../ReactHookForm/Input';
import PasswordInput from '../../ReactHookForm/PasswordInput';
import { useProjectFormContext } from '../ProjectFormProvider';

const AzureDevOpsForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.AZURE_DEVOPS;
    return (
        <>
            <PasswordInput
                name="dbt.personal_access_token"
                label="Personal access token"
                labelHelp={
                    <>
                        <p>
                            This is your secret token used to access Azure
                            Devops. See the
                            <a
                                href="https://docs.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops&tabs=Windows"
                                target="_blank" rel="noreferrer"
                            >
                                {' '}
                                instructions to create a personal access token{' '}
                            </a>
                            you can add the custom domain for your project in
                            here.
                        </p>

                        <p>
                            You must specify at least the <b>Repo:Read</b>{' '}
                            scope.
                        </p>
                    </>
                }
                rules={{
                    required: requireSecrets ? 'Required field' : undefined,
                }}
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                disabled={disabled}
            />
            <Input
                name="dbt.organization"
                label="Organization"
                labelHelp="This is the name of the organization that owns your repository"
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Repository'),
                    },
                }}
                disabled={disabled}
            />
            <Input
                name="dbt.project"
                label="Project"
                labelHelp="This is the name of the project that owns your repository"
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Repository'),
                    },
                }}
                disabled={disabled}
            />
            <Input
                name="dbt.repository"
                label="Repository"
                labelHelp="This is the name of the repository. For many projects, this is the same as your project name above."
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Repository'),
                    },
                }}
                disabled={disabled}
            />
            <Input
                name="dbt.branch"
                label="Branch"
                labelHelp={
                    <>
                        <p>
                            This is the branch in your Azure DevOps repo that
                            Lightdash should sync to. e.g. <b>main</b>,{' '}
                            <b>master</b> or <b>dev</b>
                        </p>
                        <p>
                            By default, we've set this to <b>main</b> but you
                            can change it to whatever you'd like.
                        </p>
                    </>
                }
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Branch'),
                    },
                }}
                disabled={disabled}
                defaultValue="main"
            />
            <Input
                name="dbt.project_sub_path"
                label="Project directory path"
                labelHelp={
                    <>
                        <p>
                            This is the folder where your <b>dbt_project.yml</b>{' '}
                            file is found in the Azure DevOps repository you
                            entered above.
                        </p>
                        <p>
                            If your <b>dbt_project.yml</b> file is in the main
                            folder of your repo (e.g.{' '}
                            <b>lightdash/lightdash-analytics/dbt_project.yml</b>
                            ), then you don't need to change anything in here.
                            You can just leave the default value we've put in.
                        </p>

                        <p>
                            If your dbt project is in a sub-folder in your repo
                            (e.g.{' '}
                            <b>
                                lightdash/lightdash-analytics/dbt/dbt_project.yml
                            </b>
                            ), then you'll need to include the path to the
                            sub-folder where your dbt project is (e.g.
                            <b>/dbt</b>).
                        </p>
                    </>
                }
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces(
                            'Project directory path',
                        ),
                        startWithSlash: startWithSlash(
                            'Project directory path',
                        ),
                    },
                }}
                disabled={disabled}
                defaultValue="/"
            />
        </>
    );
};

export default AzureDevOpsForm;
