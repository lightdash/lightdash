import { DbtProjectType } from '@lightdash/common';
import React, { FC } from 'react';
import {
    hasNoWhiteSpaces,
    isGitRepository,
    isValidGithubToken,
    startWithSlash,
} from '../../../utils/fieldValidators';
import Input from '../../ReactHookForm/Input';
import PasswordInput from '../../ReactHookForm/PasswordInput';
import { useProjectFormContext } from '../ProjectFormProvider';

const GithubForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.GITHUB;
    return (
        <>
            <PasswordInput
                name="dbt.personal_access_token"
                label="Personal access token"
                labelHelp={
                    <p>
                        This is used to access your repo.
                        <a
                            target="_blank"
                            href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#github"
                            rel="noreferrer"
                        >
                            {' '}
                            Click to open documentation
                        </a>
                        .
                    </p>
                }
                rules={{
                    required: requireSecrets ? 'Required field' : undefined,
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces(
                            'Personal access token',
                        ),
                        isValidGithubToken: isValidGithubToken(
                            'Personal access token',
                        ),
                    },
                }}
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                disabled={disabled}
            />
            <Input
                name="dbt.repository"
                label="Repository"
                labelHelp={
                    <p>
                        This should be in the format <b>my-org/my-repo</b>. e.g.{' '}
                        <b>lightdash/lightdash-analytics</b>
                    </p>
                }
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Repository'),
                        isGitRepository: isGitRepository('Repository'),
                    },
                }}
                disabled={disabled}
                placeholder="org/project"
            />
            <Input
                name="dbt.branch"
                label="Branch"
                labelHelp={
                    <>
                        <p>
                            This is the branch in your GitHub repo that
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
                            Put <b>/</b> if your <b>dbt_project.yml</b> file is
                            in the main folder of your repo (e.g.
                            lightdash/lightdash-analytics/dbt_project.yml).
                        </p>
                        <p>
                            Include the path to the sub-folder where your dbt
                            project is if your dbt project is in a sub-folder in
                            your repo. For example, if my project was in
                            lightdash/lightdash-analytics/dbt/dbt_project.yml,
                            I'd write <b>/dbt</b> in this field.
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
            <Input
                name="dbt.host_domain"
                label="Host domain (for Github Enterprise)"
                labelHelp="If you've customized the domain for your Bitbucket server, you can add the custom domain for your project in here."
                disabled={disabled}
                defaultValue="github.com"
            />
        </>
    );
};

export default GithubForm;
