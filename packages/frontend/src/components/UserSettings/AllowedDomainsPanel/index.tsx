import {
    AllowedEmailDomains,
    OrganizationMemberRole,
    ProjectType,
    validateOrganizationEmailDomains,
} from '@lightdash/common';
import { ProjectMemberRole } from '@lightdash/common/src/types/projectMemberProfile';
import {
    ActionIcon,
    Button,
    Flex,
    MultiSelect,
    Select,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconHelpCircle, IconPlus, IconX } from '@tabler/icons-react';
import { FC, ForwardedRef, forwardRef, useEffect, useMemo } from 'react';
import {
    useAllowedEmailDomains,
    useUpdateAllowedEmailDomains,
} from '../../../hooks/organization/useAllowedDomains';
import { useProjects } from '../../../hooks/useProjects';
import { isValidEmailDomain } from '../../../utils/fieldValidators';
import MantineIcon from '../../common/MantineIcon';

const roleOptions: Array<{
    value: AllowedEmailDomains['role'];
    label: string;
    subLabel: string;
}> = [
    {
        value: OrganizationMemberRole.EDITOR,
        label: 'Organization Editor',
        subLabel: 'Has edit access across all projects in the org',
    },
    {
        value: OrganizationMemberRole.INTERACTIVE_VIEWER,
        label: 'Organization Interactive Viewer',
        subLabel: 'Has interactive access across all projects in the org',
    },
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

const projectRoleOptions: Array<{
    value: ProjectMemberRole;
    label: string;
    subLabel: string;
}> = [
    {
        value: ProjectMemberRole.EDITOR,
        label: 'Editor',
        subLabel: 'Has edit access in this project',
    },
    {
        value: ProjectMemberRole.INTERACTIVE_VIEWER,
        label: 'Interactive Viewer',
        subLabel: 'Has interactive access in this project',
    },
    {
        value: ProjectMemberRole.VIEWER,
        label: 'Viewer',
        subLabel: 'Has view access in this project',
    },
];

const AllowedDomainsPanel: FC = () => {
    const form = useForm({
        initialValues: {
            emailDomains: [] as string[],
            role: OrganizationMemberRole.VIEWER as AllowedEmailDomains['role'],
            projects: [] as AllowedEmailDomains['projects'],
        },
    });
    const { setFieldValue } = form;

    const { data: projects, isInitialLoading: isLoadingProjects } =
        useProjects();
    const {
        data: allowedEmailDomainsData,
        isInitialLoading: emailDomainsLoading,
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
            setFieldValue('emailDomains', allowedEmailDomainsData.emailDomains);
            setFieldValue('role', allowedEmailDomainsData.role);
            setFieldValue('projects', allowedEmailDomainsData.projects);
        }
    }, [allowedEmailDomainsData, projectOptions, setFieldValue]);

    const handleOnSubmit = form.onSubmit((values) => {
        const role =
            values.emailDomains.length > 0
                ? values.role
                : OrganizationMemberRole.VIEWER;
        const newProjects =
            role === OrganizationMemberRole.MEMBER ? values.projects : [];
        mutate({
            emailDomains: values.emailDomains,
            role,
            projects: newProjects,
        });
    });

    const canAddMoreProjects = useMemo(
        () => form.values.projects.length < projectOptions.length,
        [form.values.projects, projectOptions.length],
    );

    const handleAddProject = () => {
        const nonSelectedProjects = projectOptions.filter(({ value }) => {
            const isSelected = form.values.projects.find(
                (project) => project.projectUuid === value,
            );
            return !isSelected;
        });
        if (nonSelectedProjects.length > 0) {
            form.insertListItem('projects', {
                projectUuid: nonSelectedProjects[0].value,
                role: ProjectMemberRole.VIEWER,
            });
        }
    };

    return isSuccess ? (
        <form name="allowedEmailDomains" onSubmit={handleOnSubmit}>
            <Stack>
                <MultiSelect
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
                    onCreate={(value) => {
                        if (!isValidEmailDomain(value)) {
                            form.setFieldError(
                                'emailDomains',
                                `${value} should not contain @, eg: (lightdash.com)`,
                            );
                            return;
                        }

                        const isInvalidOrganizationEmailDomainMessage =
                            validateOrganizationEmailDomains([
                                ...form.values.emailDomains,
                                value,
                            ]);
                        if (isInvalidOrganizationEmailDomainMessage) {
                            form.setFieldError(
                                'emailDomains',
                                isInvalidOrganizationEmailDomainMessage,
                            );
                            return;
                        }

                        return value;
                    }}
                    {...form.getInputProps('emailDomains')}
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
                                ) => (
                                    <Stack
                                        ref={ref}
                                        spacing="xs"
                                        p="xs"
                                        {...others}
                                    >
                                        <Text size="sm">{label}</Text>
                                        <Text size="xs">{subLabel}</Text>
                                    </Stack>
                                ),
                            )}
                            defaultValue={OrganizationMemberRole.VIEWER}
                            {...form.getInputProps('role')}
                            onChange={(value) => {
                                if (value) {
                                    form.setFieldValue(
                                        'role',
                                        value as AllowedEmailDomains['role'],
                                    );
                                    // set default project when changing to member role
                                    if (
                                        value ===
                                            OrganizationMemberRole.MEMBER &&
                                        form.values.projects.length === 0
                                    ) {
                                        handleAddProject();
                                    }
                                }
                            }}
                        />

                        {form.values.role === OrganizationMemberRole.MEMBER ? (
                            <div>
                                <Title order={5} mb="md">
                                    Project access
                                </Title>
                                {form.values.projects.map(
                                    ({ projectUuid }, index) => (
                                        <Flex
                                            key={projectUuid}
                                            align="flex-end"
                                            gap="xs"
                                            mb="xs"
                                        >
                                            <Select
                                                label={
                                                    index === 0
                                                        ? 'Project name'
                                                        : undefined
                                                }
                                                data={projectOptions.filter(
                                                    ({ value }) => {
                                                        const isCurrentValue =
                                                            value ===
                                                            form.values
                                                                .projects[index]
                                                                .projectUuid;
                                                        if (isCurrentValue) {
                                                            return true;
                                                        }
                                                        const isSelected =
                                                            form.values.projects.find(
                                                                (project) =>
                                                                    project.projectUuid ===
                                                                    value,
                                                            );
                                                        return !isSelected;
                                                    },
                                                )}
                                                {...form.getInputProps(
                                                    `projects.${index}.projectUuid`,
                                                )}
                                            />
                                            <Select
                                                label={
                                                    index === 0
                                                        ? 'Project role'
                                                        : undefined
                                                }
                                                disabled={isLoading}
                                                data={projectRoleOptions}
                                                itemComponent={forwardRef(
                                                    (
                                                        {
                                                            selected,
                                                            subLabel,
                                                            label,
                                                            ...others
                                                        }: any,
                                                        ref: ForwardedRef<HTMLDivElement>,
                                                    ) => {
                                                        return (
                                                            <Flex
                                                                ref={ref}
                                                                gap="xs"
                                                                justify="space-between"
                                                                align="center"
                                                                {...others}
                                                            >
                                                                <Text size="sm">
                                                                    {label}
                                                                </Text>
                                                                <Tooltip
                                                                    withinPortal
                                                                    multiline
                                                                    label={
                                                                        subLabel
                                                                    }
                                                                >
                                                                    <MantineIcon
                                                                        color={
                                                                            selected
                                                                                ? 'white'
                                                                                : 'grey'
                                                                        }
                                                                        icon={
                                                                            IconHelpCircle
                                                                        }
                                                                    />
                                                                </Tooltip>
                                                            </Flex>
                                                        );
                                                    },
                                                )}
                                                defaultValue={
                                                    ProjectMemberRole.VIEWER
                                                }
                                                {...form.getInputProps(
                                                    `projects.${index}.role`,
                                                )}
                                            />
                                            <ActionIcon
                                                color="red"
                                                variant="outline"
                                                size="35px"
                                                onClick={() =>
                                                    form.removeListItem(
                                                        'projects',
                                                        index,
                                                    )
                                                }
                                            >
                                                <MantineIcon
                                                    icon={IconX}
                                                    color="red"
                                                />
                                            </ActionIcon>
                                        </Flex>
                                    ),
                                )}
                                <Tooltip
                                    withinPortal
                                    multiline
                                    disabled={canAddMoreProjects}
                                    label={'There are no other projects to add'}
                                >
                                    <Button
                                        {...(!canAddMoreProjects && {
                                            'data-disabled': true,
                                        })}
                                        sx={{
                                            '&[data-disabled="true"]': {
                                                pointerEvents: 'all',
                                            },
                                        }}
                                        onClick={handleAddProject}
                                        variant="outline"
                                        size="xs"
                                        leftIcon={
                                            <MantineIcon icon={IconPlus} />
                                        }
                                    >
                                        Add project
                                    </Button>
                                </Tooltip>
                            </div>
                        ) : null}
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
