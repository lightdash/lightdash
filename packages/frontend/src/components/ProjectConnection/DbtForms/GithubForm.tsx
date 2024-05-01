import { DbtProjectType } from '@lightdash/common';
import { Anchor, PasswordInput, Stack, TextInput } from '@mantine/core';
import React, { type FC } from 'react';
import { useFormContext } from 'react-hook-form';
import { useApp } from '../../../providers/AppProvider';
import {
    hasNoWhiteSpaces,
    isGitRepository,
    isValidGithubToken,
    startWithSlash,
} from '../../../utils/fieldValidators';
import { useProjectFormContext } from '../ProjectFormProvider';

const GithubForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { savedProject } = useProjectFormContext();
    const { register } = useFormContext();
    const { health: healthState } = useApp();

    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.GITHUB;
    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <PasswordInput
                    label="Personal access token"
                    description={
                        <p>
                            This is used to access your repo.
                            <Anchor
                                target="_blank"
                                href={`${healthState.data?.siteHelpdeskUrl}/get-started/setup-lightdash/connect-project#github`}
                                rel="noreferrer"
                            >
                                {' '}
                                Click to open documentation
                            </Anchor>
                            .
                        </p>
                    }
                    required={requireSecrets}
                    {...register('dbt.personal_access_token', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces(
                                'Personal access token',
                            ),
                            isValidGithubToken: isValidGithubToken(
                                'Personal access token',
                            ),
                        },
                    })}
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    disabled={disabled}
                />
                <TextInput
                    label="Repository"
                    description={
                        <p>
                            This should be in the format <b>my-org/my-repo</b>.
                            e.g. <b>lightdash/lightdash-analytics</b>
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
                                This is the branch in your GitHub repo that
                                should sync to. e.g. <b>main</b>, <b>master</b>{' '}
                                or <b>dev</b>
                            </p>
                            <p>
                                By default, we've set this to <b>main</b> but
                                you can change it to whatever you'd like.
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
                    label="Host domain (for Github Enterprise)"
                    description="If you've customized the domain for your Github, you can add the custom domain for your project in here."
                    disabled={disabled}
                    defaultValue="github.com"
                    {...register('dbt.host_domain')}
                />
            </Stack>
        </>
    );
};

export default GithubForm;
