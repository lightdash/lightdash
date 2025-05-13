import { DbtProjectType } from '@lightdash/common';
import { Anchor, PasswordInput, TextInput } from '@mantine/core';
import { type FC } from 'react';
import { useFormContext } from '../formContext';
import DbtVersionSelect from '../Inputs/DbtVersion';
import { useProjectFormContext } from '../useProjectFormContext';
import { gitlabDefaultValues } from './defaultValues';

const GitlabForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.GITLAB;
    const form = useFormContext();
    return (
        <>
            <PasswordInput
                {...form.getInputProps('dbt.personal_access_token')}
                label="Personal access token"
                description={
                    <>
                        <p>
                            This is used to access your repo. See the{' '}
                            <Anchor
                                target="_blank"
                                href="https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html"
                                rel="noreferrer"
                            >
                                instructions for creating a personal access
                                token here
                            </Anchor>
                            .
                        </p>
                        <p>
                            Select read_repository scope when you're creating
                            the token.
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
                label="Repository"
                description={
                    <p>
                        This should be in the format <b>my-org/my-repo</b>. e.g.{' '}
                        <b>lightdash/lightdash-analytics</b>
                    </p>
                }
                required
                {...form.getInputProps('dbt.repository')}
                disabled={disabled}
                placeholder="org/project"
            />
            <DbtVersionSelect disabled={disabled} />

            <TextInput
                label="Branch"
                description={
                    <>
                        <p>
                            This is the branch in your Gitlab repo that
                            Lightdash should sync to. e.g. <b>main</b>,{' '}
                            <b>master</b> or <b>dev</b>
                        </p>
                        <p>
                            By default, we've set this to <b>main</b> but you
                            can change it to whatever you'd like.
                        </p>
                    </>
                }
                required
                {...form.getInputProps('dbt.branch')}
                disabled={disabled}
                defaultValue={gitlabDefaultValues.branch}
            />
            <TextInput
                label="Project directory path"
                description={
                    <>
                        <p>
                            This is the folder where your <b>dbt_project.yml</b>{' '}
                            file is found in the GitLab repository you entered
                            above.
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
                required
                {...form.getInputProps('dbt.project_sub_path')}
                disabled={disabled}
                defaultValue={gitlabDefaultValues.project_sub_path}
            />
            <TextInput
                label="Host domain (for self-hosted instances)"
                description={
                    <p>
                        If you’ve customized the domain for your GitLab pages,
                        you can add the custom domain for your project in here.
                        By default, this is
                        <Anchor
                            href="http://gitlab.io/"
                            target="_blank"
                            rel="noreferrer"
                        >
                            {' '}
                            gitlab.io
                        </Anchor>
                        .
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
