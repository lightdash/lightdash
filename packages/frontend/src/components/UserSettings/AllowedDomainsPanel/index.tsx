import {
    isValidEmailDomain,
    OrganizationMemberRole,
    ProjectMemberRole,
    ProjectType,
    validateOrganizationEmailDomains,
    type AllowedEmailDomains,
} from '@lightdash/common';
import {
    Flex,
    Stack,
    Text,
    Title,
    Button,
    ActionIcon,
    Select,
} from '@mantine-8/core';
import { MultiSelect, Tooltip } from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconHelpCircle, IconPlus, IconTrash } from '@tabler/icons-react';
import { useEffect, useMemo, type FC } from 'react';
import { z } from 'zod';
import {
    useAllowedEmailDomains,
    useUpdateAllowedEmailDomains,
} from '../../../hooks/organization/useAllowedDomains';
import { useProjects } from '../../../hooks/useProjects';
import MantineIcon from '../../common/MantineIcon';
import styles from './AllowedDomainsPanel.module.css';

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

const validationSchema = z.object({
    emailDomains: z.array(z.string().nonempty()),
    role: z.nativeEnum(OrganizationMemberRole),
    projects: z.array(
        z.object({
            projectUuid: z.string().nonempty(),
            role: z.nativeEnum(ProjectMemberRole),
        }),
    ),
});

type FormValues = z.infer<typeof validationSchema>;

const AllowedDomainsPanel: FC = () => {
    const form = useForm<FormValues>({
        initialValues: {
            emailDomains: [],
            role: OrganizationMemberRole.VIEWER,
            projects: [],
        },
        validate: zodResolver(validationSchema),
    });

    const { data: projects, isLoading: isLoadingProjects } = useProjects();

    const {
        data: allowedEmailDomainsData,
        isLoading: isAllowedEmailDomainsDataLoading,
        isSuccess,
    } = useAllowedEmailDomains();

    const { mutate, isLoading: isUpdateAllowedEmailDomainsLoading } =
        useUpdateAllowedEmailDomains();

    const isLoading =
        isUpdateAllowedEmailDomainsLoading ||
        isAllowedEmailDomainsDataLoading ||
        isLoadingProjects;

    useEffect(() => {
        if (isAllowedEmailDomainsDataLoading || !allowedEmailDomainsData)
            return;

        const initialValues = {
            emailDomains: allowedEmailDomainsData.emailDomains,
            role: allowedEmailDomainsData.role,
            projects: allowedEmailDomainsData.projects,
        };

        form.setInitialValues(initialValues);
        form.setValues(initialValues);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allowedEmailDomainsData, isAllowedEmailDomainsDataLoading]);

    const projectOptions = useMemo(() => {
        if (!projects) return [];

        return projects
            .filter(({ type }) => type !== ProjectType.PREVIEW)
            .map((item) => ({
                value: item.projectUuid,
                label: item.name,
            }));
    }, [projects]);

    const handleSubmit = form.onSubmit((values) => {
        if (!form.isValid()) return;

        const role =
            values.emailDomains.length > 0
                ? values.role
                : OrganizationMemberRole.VIEWER;

        const newProjects =
            role === OrganizationMemberRole.MEMBER ? values.projects : [];

        mutate({
            emailDomains: values.emailDomains,
            role: role as AllowedEmailDomains['role'],
            projects: newProjects as AllowedEmailDomains['projects'],
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
        <form name="allowedEmailDomains" onSubmit={handleSubmit}>
            <Stack>
                <MultiSelect
                    creatable
                    searchable
                    name="emailDomains"
                    label="Allowed email domains"
                    placeholder="E.g. lightdash.com"
                    disabled={isLoading}
                    data={form.values.emailDomains.map((emailDomain) => ({
                        value: emailDomain,
                        label: emailDomain,
                    }))}
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
                    getCreateLabel={(query: string) => `+ Add ${query} domain`}
                    defaultValue={form.values.emailDomains}
                    {...form.getInputProps('emailDomains')}
                />

                {!!form.values.emailDomains.length && (
                    <>
                        <Select
                            allowDeselect={false}
                            label="Default role"
                            name="role"
                            placeholder="Organization viewer"
                            disabled={isLoading}
                            data={roleOptions}
                            renderOption={({ option }) => {
                                const role = roleOptions.find(
                                    ({ value }) => value === option.value,
                                );
                                return (
                                    <Stack gap="xs" p="xs">
                                        <Text size="sm">{option.label}</Text>
                                        <Text size="xs">{role?.subLabel}</Text>
                                    </Stack>
                                );
                            }}
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

                                <Stack gap="sm" align="flex-start">
                                    {form.values.projects.map(
                                        ({ projectUuid }, index) => (
                                            <Flex
                                                key={projectUuid}
                                                align="flex-end"
                                                gap="xs"
                                            >
                                                <Select
                                                    allowDeselect={false}
                                                    size="xs"
                                                    disabled={isLoading}
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
                                                                    .projects[
                                                                    index
                                                                ].projectUuid;
                                                            if (
                                                                isCurrentValue
                                                            ) {
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
                                                    allowDeselect={false}
                                                    label={
                                                        index === 0
                                                            ? 'Project role'
                                                            : undefined
                                                    }
                                                    disabled={isLoading}
                                                    size="xs"
                                                    data={projectRoleOptions}
                                                    renderOption={({
                                                        option,
                                                        checked,
                                                    }) => {
                                                        const role =
                                                            projectRoleOptions.find(
                                                                ({ value }) =>
                                                                    value ===
                                                                    option.value,
                                                            );
                                                        return (
                                                            <Flex
                                                                gap="xs"
                                                                justify="space-between"
                                                                align="center"
                                                            >
                                                                <Text size="xs">
                                                                    {
                                                                        option.label
                                                                    }
                                                                </Text>

                                                                <Tooltip
                                                                    withinPortal
                                                                    multiline
                                                                    label={
                                                                        role?.subLabel
                                                                    }
                                                                >
                                                                    <MantineIcon
                                                                        color={
                                                                            checked
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
                                                    }}
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
                                                    size={30}
                                                    disabled={isLoading}
                                                    onClick={() =>
                                                        form.removeListItem(
                                                            'projects',
                                                            index,
                                                        )
                                                    }
                                                >
                                                    <MantineIcon
                                                        icon={IconTrash}
                                                        size="sm"
                                                    />
                                                </ActionIcon>
                                            </Flex>
                                        ),
                                    )}

                                    <Tooltip
                                        withinPortal
                                        multiline
                                        disabled={canAddMoreProjects}
                                        label={
                                            'There are no other projects to add'
                                        }
                                    >
                                        <Button
                                            {...(!canAddMoreProjects && {
                                                'data-disabled': true,
                                            })}
                                            className={styles.addProjectButton}
                                            onClick={handleAddProject}
                                            variant="outline"
                                            size="xs"
                                            leftSection={
                                                <MantineIcon icon={IconPlus} />
                                            }
                                        >
                                            Add project
                                        </Button>
                                    </Tooltip>
                                </Stack>
                            </div>
                        ) : null}
                    </>
                )}

                <Flex justify="flex-end" gap="sm">
                    {form.isDirty() && !isUpdateAllowedEmailDomainsLoading && (
                        <Button variant="outline" onClick={() => form.reset()}>
                            Cancel
                        </Button>
                    )}
                    <Button
                        type="submit"
                        display="block"
                        loading={isLoading}
                        disabled={!form.isDirty()}
                    >
                        Update
                    </Button>
                </Flex>
            </Stack>
        </form>
    ) : null;
};

export default AllowedDomainsPanel;
