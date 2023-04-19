import { Button, Intent } from '@blueprintjs/core';
import { OrganizationMemberRole, ProjectType } from '@lightdash/common';
import { FC, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import {
    useAllowedEmailDomains,
    useUpdateAllowedEmailDomains,
} from '../../../hooks/organization/useAllowedDomains';
import { useProjects } from '../../../hooks/useProjects';
import {
    isValidEmailDomain,
    isValidOrganizationDomain,
} from '../../../utils/fieldValidators';
import Form from '../../ReactHookForm/Form';
import MultiSelect from '../../ReactHookForm/MultiSelect';
import Select2 from '../../ReactHookForm/Select2';
import TagInput from '../../ReactHookForm/TagInput';
import { Description } from '../DeleteOrganizationPanel/DeleteOrganizationPanel.styles';
import { FormWrapper } from '../OrganizationPanel/OrganizationPanel.styles';

type FormData = {
    emailDomains: string[];
    role: OrganizationMemberRole;
    projects: { value: string; label: string }[];
};

const roleOptions = [
    {
        value: OrganizationMemberRole.VIEWER,
        label: 'Organization Viewer',
        subLabel: (
            <Description>
                Has view access across all projects in the org
            </Description>
        ),
    },
    {
        value: OrganizationMemberRole.MEMBER,
        label: 'Organization Member',
        subLabel: (
            <Description>Has view access to selected projects only</Description>
        ),
    },
];

const AllowedDomainsPanel: FC = () => {
    const methods = useForm<FormData>({
        mode: 'onSubmit',
        defaultValues: {
            emailDomains: [],
            role: OrganizationMemberRole.VIEWER,
            projects: [],
        },
    });
    const { data: projects, isLoading: isLoadingProjects } = useProjects();
    const { data, isLoading: emailDomainsLoading } = useAllowedEmailDomains();
    const { mutate, isLoading: updateEmailDomainsLoading } =
        useUpdateAllowedEmailDomains();
    const isLoading =
        updateEmailDomainsLoading || emailDomainsLoading || isLoadingProjects;

    const projectOptions = useMemo(() => {
        return (projects || [])
            .filter(({ type }) => type !== ProjectType.PREVIEW)
            .map((item) => ({
                value: item.projectUuid,
                label: item.name,
            }));
    }, [projects]);

    const selectedEmailDomains = methods.watch('emailDomains', []);
    const selectedRole = methods.watch('role', OrganizationMemberRole.VIEWER);

    useEffect(() => {
        if (data) {
            methods.setValue('emailDomains', data.emailDomains);
            methods.setValue('role', data.role);
            methods.setValue(
                'projects',
                projectOptions.filter(({ value }) =>
                    data.projectUuids.includes(value),
                ),
            );
        }
    }, [data, methods, projectOptions]);

    const handleUpdate = (values: FormData) => {
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
    };

    return (
        <FormWrapper>
            <Form
                name="login"
                methods={methods}
                onSubmit={handleUpdate}
                disableSubmitOnEnter
                isLoading={isLoading}
            >
                <TagInput
                    label="Allowed email domains"
                    name="emailDomains"
                    placeholder="E.g. lightdash.com"
                    disabled={isLoading}
                    defaultValue={data?.emailDomains || []}
                    rules={{
                        validate: {
                            isValidEmailDomain:
                                isValidEmailDomain('Email domains'),
                            isValidOrganizationDomain:
                                isValidOrganizationDomain('Email domains'),
                        },
                    }}
                />
                {selectedEmailDomains.length > 0 && (
                    <>
                        <Select2
                            label="Default role"
                            name="role"
                            placeholder="Organization viewer"
                            disabled={isLoading}
                            items={roleOptions}
                            defaultValue="viewer"
                        />
                        {projectOptions.length > 0 &&
                            selectedRole === OrganizationMemberRole.MEMBER && (
                                <MultiSelect
                                    label="Project Viewer Access"
                                    name="projects"
                                    items={projectOptions}
                                    placeholder="Select projects"
                                />
                            )}
                    </>
                )}
                <div style={{ flex: 1 }} />
                <Button
                    style={{ alignSelf: 'flex-end', marginTop: 20 }}
                    intent={Intent.PRIMARY}
                    text="Update"
                    loading={isLoading}
                    type="submit"
                />
            </Form>
        </FormWrapper>
    );
};

export default AllowedDomainsPanel;
