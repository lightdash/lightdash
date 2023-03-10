import { Button, Intent } from '@blueprintjs/core';
import {
    AllowedEmailDomains,
    Organisation,
    OrganizationMemberRole,
    TableSelectionType,
    UpdateAllowedEmailDomains,
} from '@lightdash/common';
import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
    useAllowedEmailDomains,
    useUpdateAllowedEmailDomains,
} from '../../../hooks/organisation/useAllowedDomains';
import { useProject } from '../../../hooks/useProject';
import { isValidEmailDomain } from '../../../utils/fieldValidators';
import Form from '../../ReactHookForm/Form';
import MultiSelect from '../../ReactHookForm/MultiSelect';
import Select2 from '../../ReactHookForm/Select2';
import TagInput from '../../ReactHookForm/TagInput';
import { Description } from '../DeleteOrganisationPanel/DeleteOrganisationPanel.styles';
import { FormWrapper } from '../OrganisationPanel/OrganisationPanel.styles';

const AllowedDomainsPanel: FC = () => {
    const methods = useForm<UpdateAllowedEmailDomains>({
        mode: 'onSubmit',
        defaultValues: {
            emailDomains: [],
            role: OrganizationMemberRole.VIEWER,
            projectUuids: [],
        },
    });

    const { data, isLoading: emailDomainsLoading } = useAllowedEmailDomains();
    const { mutate, isLoading: updateEmailDomainsLoading } =
        useUpdateAllowedEmailDomains();
    const isLoading = updateEmailDomainsLoading || emailDomainsLoading;
    // const projectNames = data?.projectUuids.map((projectUuid) => {
    //     return useProject(projectUuid).data?.name;
    // });

    useEffect(() => {
        if (data) {
            methods.setValue('emailDomains', data.emailDomains);
            methods.setValue('role', data.role);
            methods.setValue('projectUuids', data.projectUuids);
        }
    }, [data]);
    const handleUpdate = (values: UpdateAllowedEmailDomains) => {
        mutate(values);
    };

    const selectItems = [
        {
            value: OrganizationMemberRole.VIEWER,
            label: 'Organisation Viewer',
            subLabel: (
                <Description>
                    Has view access across all projects in the org
                </Description>
            ),
        },
        {
            value: OrganizationMemberRole.MEMBER,
            label: 'Organisation Member',
            subLabel: (
                <Description>
                    Has view access to selected projects only
                </Description>
            ),
        },
    ];

    console.log(methods.getValues());
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
                    disabled={isLoading}
                    defaultValue={data?.emailDomains || []}
                    rules={{
                        validate: {
                            isValidEmailDomain:
                                isValidEmailDomain('emailDomains'),
                        },
                    }}
                />
                <Select2
                    label="Default role"
                    name="role"
                    placeholder="Organisation viewer"
                    disabled={isLoading}
                    items={selectItems}
                    defaultValue="viewer"
                />
                <MultiSelect
                    label="Project Viewer Access"
                    name="projects"
                    items={data?.projectUuids || []}
                    defaultValue={data?.projectUuids || []}
                    placeholder="No projects found"
                />
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
