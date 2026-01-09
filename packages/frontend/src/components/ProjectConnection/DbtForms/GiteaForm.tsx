import { DbtProjectType } from '@lightdash/common';
import { Anchor, PasswordInput, TextInput } from '@mantine/core';
import { type FC } from 'react';
import { useFormContext } from '../formContext';
import DbtVersionSelect from '../Inputs/DbtVersion';
import { useProjectFormContext } from '../useProjectFormContext';
import { giteaDefaultValues } from './defaultValues';

const GiteaForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.GITEA;
    const form = useFormContext();

    return (
        <>
            <TextInput
                label="Username"
                description={
                    <p>
                        Your Gitea username. This is used to authenticate Git
                        operations against your repository.
                    </p>
                }
                required
                {...form.getInputProps('dbt.username')}
                disabled={disabled}
                placeholder="username"
            />
            <PasswordInput
                {...form.getInputProps('dbt.personal_access_token')}
                label="Personal access token"
                description={
                    <>
                        <p>
                            This token is used to access your repo. You can
                            create one in your Gitea profile settings. See the{' '}
                            <Anchor
                                target="_blank"
                                href="https://docs.gitea.com/usage/access-token"
                                rel="noreferrer"
                            >
                                Gitea docs
                            </Anchor>
                            .
                        </p>
                        <p>
                            Make sure the token has read/write access to the
                            repository.
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
                        This should be in the format <b>owner/repo</b>. e.g.{' '}
                        <b>simon/medical</b>
                    </p>
                }
                required
                {...form.getInputProps('dbt.repository')}
                disabled={disabled}
                placeholder="owner/repo"
            />
            <DbtVersionSelect disabled={disabled} />
            <TextInput
                label="Branch"
                description={
                    <>
                        <p>
                            This is the branch in your Gitea repo that Lightdash
                            should sync to. e.g. <b>main</b>, <b>master</b> or{' '}
                            <b>dev</b>
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
                defaultValue={giteaDefaultValues.branch}
            />
            <TextInput
                label="Project directory path"
                description={
                    <>
                        <p>
                            This is the folder where your <b>dbt_project.yml</b>{' '}
                            file is found in the repository you entered above.
                        </p>
                        <p>
                            If your <b>dbt_project.yml</b> file is in the main
                            folder of your repo, you can leave the default
                            value.
                        </p>
                    </>
                }
                required
                {...form.getInputProps('dbt.project_sub_path')}
                disabled={disabled}
                defaultValue={giteaDefaultValues.project_sub_path}
            />
            <TextInput
                label="Base URL"
                description={
                    <p>
                        The base URL of your Gitea instance. For local dev,
                        this could be <b>http://gitea:3000</b>.
                    </p>
                }
                disabled={disabled}
                {...form.getInputProps('dbt.host_domain')}
                defaultValue={giteaDefaultValues.host_domain}
                placeholder="http://gitea:3000"
            />
        </>
    );
};

export default GiteaForm;
