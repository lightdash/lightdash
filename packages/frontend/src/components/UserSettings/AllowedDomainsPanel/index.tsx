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
    Group,
    Select,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconCheck,
    IconHelpCircle,
    IconPlus,
    IconTrash,
} from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { useEffect, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
    useAllowedEmailDomains,
    useUpdateAllowedEmailDomains,
} from '../../../hooks/organization/useAllowedDomains';
import { useProjects } from '../../../hooks/useProjects';
import MantineIcon from '../../common/MantineIcon';
import { MultiSelectCombobox } from '../../common/MultiSelectCombobox/MultiSelectCombobox';
import styles from './AllowedDomainsPanel.module.css';

const getRoleOptions = (
    t: TFunction<'userSettings'>,
): Array<{
    value: AllowedEmailDomains['role'];
    label: string;
    subLabel: string;
}> => [
    {
        value: OrganizationMemberRole.EDITOR,
        label: t('allowedDomainsPanel.roles.orgEditor'),
        subLabel: t('allowedDomainsPanel.roles.orgEditorDescription'),
    },
    {
        value: OrganizationMemberRole.INTERACTIVE_VIEWER,
        label: t('allowedDomainsPanel.roles.orgInteractiveViewer'),
        subLabel: t(
            'allowedDomainsPanel.roles.orgInteractiveViewerDescription',
        ),
    },
    {
        value: OrganizationMemberRole.VIEWER,
        label: t('allowedDomainsPanel.roles.orgViewer'),
        subLabel: t('allowedDomainsPanel.roles.orgViewerDescription'),
    },
    {
        value: OrganizationMemberRole.MEMBER,
        label: t('allowedDomainsPanel.roles.orgMember'),
        subLabel: t('allowedDomainsPanel.roles.orgMemberDescription'),
    },
];

const getProjectRoleOptions = (
    t: TFunction<'userSettings'>,
): Array<{
    value: ProjectMemberRole;
    label: string;
    subLabel: string;
}> => [
    {
        value: ProjectMemberRole.EDITOR,
        label: t('allowedDomainsPanel.roles.projectEditor'),
        subLabel: t('allowedDomainsPanel.roles.projectEditorDescription'),
    },
    {
        value: ProjectMemberRole.INTERACTIVE_VIEWER,
        label: t('allowedDomainsPanel.roles.projectInteractiveViewer'),
        subLabel: t(
            'allowedDomainsPanel.roles.projectInteractiveViewerDescription',
        ),
    },
    {
        value: ProjectMemberRole.VIEWER,
        label: t('allowedDomainsPanel.roles.projectViewer'),
        subLabel: t('allowedDomainsPanel.roles.projectViewerDescription'),
    },
];

const getValidationSchema = (t: TFunction<'userSettings'>) =>
    z.object({
        emailDomains: z.array(
            z.string().min(1, t('allowedDomainsPanel.validation.domainEmpty')),
        ),
        role: z.enum(OrganizationMemberRole),
        projects: z.array(
            z.object({
                projectUuid: z
                    .string()
                    .min(
                        1,
                        t('allowedDomainsPanel.validation.projectRequired'),
                    ),
                role: z.enum(ProjectMemberRole),
            }),
        ),
    });

type FormValues = z.infer<ReturnType<typeof getValidationSchema>>;

const AllowedDomainsPanel: FC = () => {
    const { t } = useTranslation('userSettings');
    const roleOptions = useMemo(() => getRoleOptions(t), [t]);
    const projectRoleOptions = useMemo(() => getProjectRoleOptions(t), [t]);
    const validationSchema = useMemo(() => getValidationSchema(t), [t]);
    const [domainSearch, setDomainSearch] = useState('');
    const form = useForm<FormValues>({
        initialValues: {
            emailDomains: [],
            role: OrganizationMemberRole.VIEWER,
            projects: [],
        },
        validate: zodResolver(validationSchema),
    });
    const emailDomainsField = form.getInputProps('emailDomains');

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

    const handleAddEmailDomain = (value: string) => {
        if (!isValidEmailDomain(value)) {
            form.setFieldError(
                'emailDomains',
                t('allowedDomainsPanel.validation.invalidDomain', {
                    domain: value,
                }),
            );
            return;
        }

        const validationError = validateOrganizationEmailDomains([
            ...form.values.emailDomains,
            value,
        ]);
        if (validationError) {
            form.setFieldError('emailDomains', validationError);
            return;
        }

        form.clearFieldError('emailDomains');
        form.setFieldValue('emailDomains', [
            ...form.values.emailDomains,
            value,
        ]);
        setDomainSearch('');
    };

    return isSuccess ? (
        <form name="allowedEmailDomains" onSubmit={handleSubmit}>
            <Stack>
                <MultiSelectCombobox
                    name="emailDomains"
                    label={t('allowedDomainsPanel.allowedEmailDomains')}
                    placeholder={t('allowedDomainsPanel.domainsPlaceholder')}
                    disabled={isLoading}
                    error={form.errors.emailDomains}
                    options={form.values.emailDomains.map((domain) => ({
                        value: domain,
                        label: domain,
                    }))}
                    value={form.values.emailDomains}
                    hidePickedOptions
                    searchValue={domainSearch}
                    onSearchChange={setDomainSearch}
                    onBlur={emailDomainsField.onBlur}
                    onValueRemove={(domain) => {
                        form.setFieldValue(
                            'emailDomains',
                            form.values.emailDomains.filter(
                                (value) => value !== domain,
                            ),
                        );
                    }}
                    onOptionSubmit={(domain) => {
                        form.setFieldValue(
                            'emailDomains',
                            form.values.emailDomains.filter(
                                (value) => value !== domain,
                            ),
                        );
                    }}
                    onCreate={handleAddEmailDomain}
                    clearSearchOnCreate={false}
                    shouldCreate={(query) =>
                        query.trim().length > 0 &&
                        !form.values.emailDomains.some(
                            (domain) =>
                                domain.toLowerCase() ===
                                query.trim().toLowerCase(),
                        )
                    }
                    createLabel={
                        <Group gap="xxs">
                            <MantineIcon
                                icon={IconPlus}
                                color="blue.7"
                                size="sm"
                            />
                            <Text c="blue.7" fz="sm" fw={500}>
                                {t('allowedDomainsPanel.addDomain', {
                                    domain: domainSearch.trim(),
                                })}
                            </Text>
                        </Group>
                    }
                />

                {!!form.values.emailDomains.length && (
                    <>
                        <Select
                            allowDeselect={false}
                            label={t('allowedDomainsPanel.defaultRole')}
                            name="role"
                            placeholder={t(
                                'allowedDomainsPanel.defaultRolePlaceholder',
                            )}
                            disabled={isLoading}
                            data={roleOptions}
                            renderOption={({ option, checked }) => {
                                const role = roleOptions.find(
                                    ({ value }) => value === option.value,
                                );
                                return (
                                    <Group
                                        flex={1}
                                        justify="space-between"
                                        wrap="nowrap"
                                        gap="xs"
                                    >
                                        <Stack gap={0}>
                                            <Text size="sm" fw={500}>
                                                {option.label}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {role?.subLabel}
                                            </Text>
                                        </Stack>
                                        {checked && (
                                            <MantineIcon
                                                icon={IconCheck}
                                                size="sm"
                                            />
                                        )}
                                    </Group>
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
                                    {t('allowedDomainsPanel.projectAccess')}
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
                                                            ? t(
                                                                  'allowedDomainsPanel.projectName',
                                                              )
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
                                                            ? t(
                                                                  'allowedDomainsPanel.projectRole',
                                                              )
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
                                        disabled={canAddMoreProjects}
                                        label={t(
                                            'allowedDomainsPanel.noMoreProjects',
                                        )}
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
                                            {t(
                                                'allowedDomainsPanel.addProject',
                                            )}
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
                            {t('actions.cancel', { ns: 'common' })}
                        </Button>
                    )}
                    <Button
                        type="submit"
                        display="block"
                        loading={isLoading}
                        disabled={!form.isDirty()}
                    >
                        {t('actions.update', { ns: 'common' })}
                    </Button>
                </Flex>
            </Stack>
        </form>
    ) : null;
};

export default AllowedDomainsPanel;
