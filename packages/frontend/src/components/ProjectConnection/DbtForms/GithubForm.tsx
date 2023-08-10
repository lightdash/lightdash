import { DbtProjectType } from '@lightdash/common';
import { Anchor, PasswordInput, Stack, TextInput } from '@mantine/core';
import React, { FC } from 'react';
import { useProjectFormContext } from '../ProjectFormProvider';

const GithubForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.GITHUB;
    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <PasswordInput
                    name="dbt.personal_access_token"
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
                    required
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    disabled={disabled}
                    labelProps={{ style: { marginTop: '8px' } }}
                />
                <TextInput
                    name="dbt.repository"
                    label="Repository"
                    description={
                        <p>
                            This should be in the format <b>my-org/my-repo</b>.
                            e.g. <b>lightdash/lightdash-analytics</b>
                        </p>
                    }
                    required
                    disabled={disabled}
                    placeholder="org/project"
                />
                <TextInput
                    name="dbt.branch"
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
                    disabled={disabled}
                    defaultValue="main"
                />
                <TextInput
                    name="dbt.project_sub_path"
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
                    disabled={disabled}
                    defaultValue="/"
                />
                <TextInput
                    name="dbt.host_domain"
                    label="Host domain (for Github Enterprise)"
                    description="If you've customized the domain for your Bitbucket server, you can add the custom domain for your project in here."
                    disabled={disabled}
                    defaultValue="github.com"
                />
            </Stack>
        </>
    );
};

export default GithubForm;
