import { DbtProjectType } from '@lightdash/common';
import { TextInput, Text, Anchor, PasswordInput, Select } from '@mantine/core';
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
    const isNative =
        form.values.dbt.type === DbtProjectType.BITBUCKET &&
        form.values.dbt.semanticLayer === 'lightdash';
    return (
        <>
            <Select
                label="Semantic layer format"
                description="Native Lightdash YAML uses Bitbucket Cloud (bitbucket.org)."
                name="dbt.semanticLayer"
                value={isNative ? 'lightdash' : 'dbt'}
                allowDeselect={false}
                disabled={disabled}
                data={[
                    { value: 'dbt', label: 'dbt' },
                    { value: 'lightdash', label: 'Native Lightdash YAML' },
                ]}
                onChange={(value) => {
                    if (
                        (value !== 'dbt' && value !== 'lightdash') ||
                        form.values.dbt.type !== DbtProjectType.BITBUCKET
                    ) {
                        return;
                    }
                    form.setFieldValue('dbt', {
                        ...form.values.dbt,
                        semanticLayer: value,
                        ...(value === 'lightdash'
                            ? {
                                  target: undefined,
                                  selector: undefined,
                                  environment: undefined,
                                  host_domain: 'bitbucket.org',
                              }
                            : {}),
                    });
                }}
            />
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
                        <Text component="span" display="block" size="xs">
                            Bitbucket Cloud requires an{' '}
                            <Anchor
                                inherit
                                href="https://support.atlassian.com/bitbucket-cloud/docs/create-an-api-token/"
                                target="_blank"
                                rel="noreferrer"
                            >
                                API token
                            </Anchor>{' '}
                            with Repositories: Read permission. Writeback also
                            requires Repositories: Write and Pull requests: Read
                            and Write permissions.
                        </Text>
                        {!isNative && (
                            <Text component="span" display="block" size="xs">
                                For Bitbucket Server, use an{' '}
                                <Anchor
                                    inherit
                                    href="https://confluence.atlassian.com/bitbucketserver/http-access-tokens-939515499.html"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    HTTP access token
                                </Anchor>{' '}
                                with Project read and Repository read
                                permissions.
                            </Text>
                        )}
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
            {!isNative && <DbtVersionSelect disabled={disabled} />}

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
                    isNative ? (
                        'Folder containing lightdash.config.yml and models/ or lightdash/models/. Use / for the repository root.'
                    ) : (
                        <>
                            <p>
                                This is the folder where your{' '}
                                <b>dbt_project.yml</b> file is found in the
                                Bitbucket repository you entered above.
                            </p>
                            <p>
                                If your <b>dbt_project.yml</b> file is in the
                                main folder of your repo (e.g.{' '}
                                <b>
                                    lightdash/lightdash-analytics/dbt_project.yml
                                </b>
                                ), then you don't need to change anything in
                                here. You can just leave the default value we've
                                put in.
                            </p>
                            <p>
                                If your dbt project is in a sub-folder in your
                                repo (e.g.{' '}
                                <b>
                                    lightdash/lightdash-analytics/dbt/dbt_project.yml
                                </b>
                                ), then you'll need to include the path to the
                                sub-folder where your dbt project is (e.g.
                                <b>/dbt</b>).
                            </p>
                        </>
                    )
                }
                required
                disabled={disabled}
                defaultValue={bitbucketDefaultValues.project_sub_path}
            />
            {!isNative && (
                <TextInput
                    name="dbt.host_domain"
                    {...form.getInputProps('dbt.host_domain')}
                    label="Host domain (for self-hosted instances)"
                    description={
                        <p>
                            If you've
                            <Anchor
                                inherit
                                href="https://confluence.atlassian.com/bitbucketserver/specify-the-bitbucket-base-url-776640392.html"
                                target="_blank"
                                rel="noreferrer"
                            >
                                {' '}
                                customized the domain for your Bitbucket
                                server{' '}
                            </Anchor>
                            you can add the custom domain for your project in
                            here.
                        </p>
                    }
                    disabled={disabled}
                    defaultValue={bitbucketDefaultValues.host_domain}
                />
            )}
        </>
    );
};

export default BitBucketForm;
