import { DbtProjectType } from '@lightdash/common';
import { Alert, Anchor, PasswordInput, TextInput } from '@mantine/core';
import React, { type FC } from 'react';
import { useFormContext } from '../formContext';
import DbtVersionSelect from '../Inputs/DbtVersion';
import { useProjectFormContext } from '../useProjectFormContext';
import { bitbucketDefaultValues } from './defaultValues';

const BitBucketForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.BITBUCKET;
    const form = useFormContext();
    return (
        <>
            <Alert
                variant="light"
                color="yellow"
                title="Bitbucket app passwords deprecation"
                mb="md"
            >
                <Anchor
                    href="https://www.atlassian.com/blog/bitbucket/bitbucket-cloud-transitions-to-api-tokens-enhancing-security-with-app-password-deprecation"
                    target="_blank"
                    rel="noreferrer"
                >
                    Bitbucket Cloud transitions to API tokens
                </Anchor>
                . Existing app passwords will continue working until June 9,
                2026.
            </Alert>
            <TextInput
                name="dbt.username"
                {...form.getInputProps('dbt.username')}
                label="Username"
                description="This is the login name for your Bitbucket user. This is usually the same username you use to login to Bitbucket."
                required
                disabled={disabled}
                placeholder="BitBucket username"
            />
            <PasswordInput
                name="dbt.personal_access_token"
                {...form.getInputProps('dbt.personal_access_token')}
                label="API Token"
                description={
                    <>
                        <p>
                            Bitbucket Cloud users should
                            <Anchor
                                href="https://support.atlassian.com/bitbucket-cloud/docs/create-an-api-token/"
                                target="_blank"
                                rel="noreferrer"
                            >
                                {' '}
                                follow instructions for creating an API Token
                            </Anchor>
                        </p>
                        <p>
                            Bitbucket Server users should
                            <Anchor
                                href="https://confluence.atlassian.com/bitbucketserver/http-access-tokens-939515499.html"
                                target="_blank"
                                rel="noreferrer"
                            >
                                {' '}
                                follow instructions for creating a HTTP Access
                                Token
                            </Anchor>
                        </p>
                        <p>
                            Select <b>Project read</b> and{' '}
                            <b>Repository read</b> scope when you're creating
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
                name="dbt.repository"
                {...form.getInputProps('dbt.repository')}
                label="Repository"
                description={
                    <p>
                        This should be in the format <b>my-org/my-repo</b>. e.g.{' '}
                        <b>lightdash/lightdash-analytics</b>
                    </p>
                }
                required
                disabled={disabled}
                placeholder="org/project"
            />
            <DbtVersionSelect disabled={disabled} />

            <TextInput
                name="dbt.branch"
                {...form.getInputProps('dbt.branch')}
                label="Branch"
                description={
                    <>
                        <p>
                            This is the branch in your Bitbucket repo that
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
                disabled={disabled}
                defaultValue={bitbucketDefaultValues.branch}
            />
            <TextInput
                name="dbt.project_sub_path"
                {...form.getInputProps('dbt.project_sub_path')}
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
                disabled={disabled}
                defaultValue={bitbucketDefaultValues.project_sub_path}
            />
            <TextInput
                name="dbt.host_domain"
                {...form.getInputProps('dbt.host_domain')}
                label="Host domain (for self-hosted instances)"
                description={
                    <p>
                        If you've
                        <Anchor
                            href="https://confluence.atlassian.com/bitbucketserver/specify-the-bitbucket-base-url-776640392.html"
                            target="_blank"
                            rel="noreferrer"
                        >
                            {' '}
                            customized the domain for your Bitbucket server{' '}
                        </Anchor>
                        you can add the custom domain for your project in here.
                    </p>
                }
                disabled={disabled}
                defaultValue={bitbucketDefaultValues.host_domain}
            />
        </>
    );
};

export default BitBucketForm;
