import { DbtProjectType } from '@lightdash/common';
import { Anchor, PasswordInput, TextInput } from '@mantine/core';
import React, { type FC } from 'react';
import { useFormContext } from 'react-hook-form';
import {
    hasNoWhiteSpaces,
    isGitRepository,
    startWithSlash,
} from '../../../utils/fieldValidators';
import { useProjectFormContext } from '../ProjectFormProvider';

const BitBucketForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.BITBUCKET;
    const { register } = useFormContext();
    return (
        <>
            <TextInput
                label="Username"
                description="This is the login name for your Bitbucket user. This is usually the same username you use to login to Bitbucket."
                required
                {...register('dbt.username', {
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Username'),
                    },
                })}
                disabled={disabled}
                placeholder="BitBucket username"
            />
            <PasswordInput
                label="HTTP access token"
                description={
                    <>
                        <p>
                            Bitbucket Cloud users should
                            <Anchor
                                href="https://support.atlassian.com/bitbucket-cloud/docs/create-an-app-password/"
                                target="_blank"
                                rel="noreferrer"
                            >
                                {' '}
                                follow instructions for creating an App Password
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
                {...register('dbt.personal_access_token')}
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
                {...register('dbt.repository', {
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Repository'),
                        isGitRepository: isGitRepository('Repository'),
                    },
                })}
                disabled={disabled}
                placeholder="org/project"
            />
            <TextInput
                label="Branch"
                description={
                    <>
                        <p>
                            This is the branch in your Bitbucket repo that the
                            application should sync to. e.g. <b>main</b>,{' '}
                            <b>master</b> or <b>dev</b>
                        </p>
                        <p>
                            By default, we've set this to <b>main</b> but you
                            can change it to whatever you'd like.
                        </p>
                    </>
                }
                required
                {...register('dbt.branch', {
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Branch'),
                    },
                })}
                disabled={disabled}
                defaultValue="main"
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
                {...register('dbt.project_sub_path', {
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces(
                            'Project directory path',
                        ),
                        startWithSlash: startWithSlash(
                            'Project directory path',
                        ),
                    },
                })}
                disabled={disabled}
                defaultValue="/"
            />
            <TextInput
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
                defaultValue="bitbucket.org"
                {...register('dbt.host_domain', {
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Host domain'),
                    },
                })}
            />
        </>
    );
};

export default BitBucketForm;
