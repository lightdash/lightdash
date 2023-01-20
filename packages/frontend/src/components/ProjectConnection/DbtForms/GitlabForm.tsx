import { DbtProjectType } from '@lightdash/common';
import React, { FC } from 'react';
import {
    hasNoWhiteSpaces,
    isGitRepository,
    startWithSlash,
} from '../../../utils/fieldValidators';
import BlueprintLink from '../../common/BlueprintLink';
import BlueprintParagraph from '../../common/BlueprintParagraph';
import Input from '../../ReactHookForm/Input';
import PasswordInput from '../../ReactHookForm/PasswordInput';
import { useProjectFormContext } from '../ProjectFormProvider';

const GitlabForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.GITLAB;
    return (
        <>
            <PasswordInput
                name="dbt.personal_access_token"
                label="Personal access token"
                labelHelp={
                    <>
                        <BlueprintParagraph>
                            This is used to access your repo. See the{' '}
                            <BlueprintLink
                                target="_blank"
                                href="https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html"
                                rel="noreferrer"
                            >
                                instructions for creating a personal access
                                token here
                            </BlueprintLink>
                            .
                        </BlueprintParagraph>
                        <BlueprintParagraph>
                            Select read_repository scope when you're creating
                            the token.
                        </BlueprintParagraph>
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
                name="dbt.repository"
                label="Repository"
                labelHelp={
                    <BlueprintParagraph>
                        This should be in the format <b>my-org/my-repo</b>. e.g.{' '}
                        <b>lightdash/lightdash-analytics</b>
                    </BlueprintParagraph>
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
                        <BlueprintParagraph>
                            This is the branch in your Gitlab repo that
                            Lightdash should sync to. e.g. <b>main</b>,{' '}
                            <b>master</b> or <b>dev</b>
                        </BlueprintParagraph>
                        <BlueprintParagraph>
                            By default, we've set this to <b>main</b> but you
                            can change it to whatever you'd like.
                        </BlueprintParagraph>
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
                        <BlueprintParagraph>
                            This is the folder where your <b>dbt_project.yml</b>{' '}
                            file is found in the GitLab repository you entered
                            above.
                        </BlueprintParagraph>
                        <BlueprintParagraph>
                            If your <b>dbt_project.yml</b> file is in the main
                            folder of your repo (e.g.{' '}
                            <b>lightdash/lightdash-analytics/dbt_project.yml</b>
                            ), then you don't need to change anything in here.
                            You can just leave the default value we've put in.
                        </BlueprintParagraph>

                        <BlueprintParagraph>
                            If your dbt project is in a sub-folder in your repo
                            (e.g.{' '}
                            <b>
                                lightdash/lightdash-analytics/dbt/dbt_project.yml
                            </b>
                            ), then you'll need to include the path to the
                            sub-folder where your dbt project is (e.g.
                            <b>/dbt</b>).
                        </BlueprintParagraph>
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
                label="Host domain (for self-hosted instances)"
                labelHelp={
                    <BlueprintParagraph>
                        If you’ve customized the domain for your GitLab pages,
                        you can add the custom domain for your project in here.
                        By default, this is
                        <BlueprintLink
                            href="http://gitlab.io/"
                            target="_blank"
                            rel="noreferrer"
                        >
                            {' '}
                            gitlab.io
                        </BlueprintLink>
                        .
                    </BlueprintParagraph>
                }
                disabled={disabled}
                defaultValue="gitlab.com"
                rules={{
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Host domain'),
                    },
                }}
            />
        </>
    );
};

export default GitlabForm;
