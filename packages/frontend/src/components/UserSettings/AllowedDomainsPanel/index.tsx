import { OrganizationMemberRole, ProjectType } from '@lightdash/common';
import {
    Button,
    MultiSelect as MantineMultiSelect,
    Select,
    Stack,
    Text,
} from '@mantine/core';
import { useForm as mantineUseForm } from '@mantine/form';
import { FC, ForwardedRef, forwardRef, useEffect, useMemo } from 'react';

import {
    useAllowedEmailDomains,
    useUpdateAllowedEmailDomains,
} from '../../../hooks/organization/useAllowedDomains';
import { useProjects } from '../../../hooks/useProjects';
// import {
//     isValidEmailDomain,
//     isValidOrganizationDomain,
// } from '../../../utils/fieldValidators';

const roleOptions = [
    {
        value: OrganizationMemberRole.VIEWER,
        label: 'Organization Viewer',
        subLabel: 'Has view access across all projects in the org',
    },
    {
        value: OrganizationMemberRole.MEMBER,
        label: 'Organization Member',
        subLabel: 'Has view access to selected projects only',
    },
];

const AllowedDomainsPanel: FC = () => {
    const form = mantineUseForm({
        initialValues: {
            emailDomains: [] as string[],
            role: OrganizationMemberRole.VIEWER,
            projects: [] as {
                value: string;
                label: string;
            }[],
        },
    });

    const { data: projects, isLoading: isLoadingProjects } = useProjects();
    const {
        data: allowedEmailDomainsData,
        isLoading: emailDomainsLoading,
        isSuccess,
    } = useAllowedEmailDomains();
    const { mutate, isLoading: updateEmailDomainsLoading } =
        useUpdateAllowedEmailDomains();
    const isLoading =
        updateEmailDomainsLoading || emailDomainsLoading || isLoadingProjects;

    const projectOptions = useMemo(
        () =>
            (projects || [])
                .filter(({ type }) => type !== ProjectType.PREVIEW)
                .map((item) => ({
                    value: item.projectUuid,
                    label: item.name,
                })),
        [projects],
    );

    useEffect(() => {
        if (allowedEmailDomainsData) {
            form.setFieldValue(
                'emailDomains',
                allowedEmailDomainsData.emailDomains,
            );
            form.setFieldValue('role', allowedEmailDomainsData.role);
            form.setFieldValue(
                'projects',
                projectOptions.filter(({ value }) =>
                    allowedEmailDomainsData.projectUuids.includes(value),
                ),
            );
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allowedEmailDomainsData]);

    const handleOnSubmit = form.onSubmit((values) => {
        console.log({ values });
        const role =
            values.emailDomains.length > 0
                ? values.role
                : OrganizationMemberRole.VIEWER;
        const projectUuids =
            role === OrganizationMemberRole.MEMBER
                ? values.projects.map(({ value }) => value)
                : [];
        mutate({
            emailDomains: values.emailDomains,
            role,
            projectUuids,
        });
    });

    return isSuccess ? (
        <form name="allowedEmailDomains" onSubmit={handleOnSubmit}>
            <Stack>
                <MantineMultiSelect
                    name="emailDomains"
                    label="Allowed email domains"
                    placeholder="E.g. lightdash.com"
                    disabled={isLoading}
                    data={form.values.emailDomains.map((emailDomain) => ({
                        value: emailDomain,
                        label: emailDomain,
                    }))}
                    searchable
                    creatable
                    getCreateLabel={(query: string) => `+ Add ${query} domain`}
                    defaultValue={form.values.emailDomains}
                    {...form.getInputProps('emailDomains')}
                    // rules={{
                    //     validate: {
                    //         isValidEmailDomain:
                    //             isValidEmailDomain('Email domains'),
                    //         isValidOrganizationDomain:
                    //             isValidOrganizationDomain('Email domains'),
                    //     },
                    // }}
                />

                {!!form.values.emailDomains.length && (
                    <>
                        <Select
                            label="Default role"
                            name="role"
                            placeholder="Organization viewer"
                            disabled={isLoading}
                            data={roleOptions}
                            itemComponent={forwardRef(
                                (
                                    { subLabel, label, ...others }: any,
                                    ref: ForwardedRef<HTMLDivElement>,
                                ) => {
                                    console.log(others);

                                    return (
                                        <Stack
                                            ref={ref}
                                            spacing="xs"
                                            p="xs"
                                            {...others}
                                        >
                                            <Text size="sm">{label}</Text>
                                            <Text size="xs">{subLabel}</Text>
                                        </Stack>
                                    );
                                },
                            )}
                            defaultValue="viewer"
                            {...form.getInputProps('role')}
                        />

                        {projectOptions.length > 0 &&
                            form.values.role ===
                                OrganizationMemberRole.MEMBER && (
                                <MantineMultiSelect
                                    label="Project Viewer Access"
                                    placeholder="Select projects"
                                    data={projectOptions}
                                    {...form.getInputProps('projects')}
                                />
                            )}
                    </>
                )}
                <Button
                    type="submit"
                    display="block"
                    ml="auto"
                    loading={isLoading}
                >
                    Update
                </Button>
            </Stack>
        </form>
    ) : null;
};

export default AllowedDomainsPanel;
