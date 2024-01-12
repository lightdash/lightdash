import { ProjectType } from '@lightdash/common';
import { Button, Select, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import React, { FC, useEffect } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useOrganizationUpdateMutation } from '../../../hooks/organization/useOrganizationUpdateMutation';
import { useProjects } from '../../../hooks/useProjects';

const DefaultProjectPanel: FC = () => {
    const { isInitialLoading: isOrganizationLoading, data } = useOrganization();
    const { isInitialLoading: isLoadingProjects, data: projects = [] } =
        useProjects();
    const {
        isLoading: isOrganizationUpdateLoading,
        mutate: updateOrganization,
    } = useOrganizationUpdateMutation();

    const isLoading =
        isOrganizationUpdateLoading ||
        isOrganizationLoading ||
        isLoadingProjects;
    const form = useForm({
        initialValues: {
            defaultProjectUuid: undefined as string | undefined,
        },
    });

    const { setFieldValue } = form;

    useEffect(() => {
        if (data) {
            setFieldValue('defaultProjectUuid', data?.defaultProjectUuid);
        }
    }, [data, data?.defaultProjectUuid, setFieldValue]);

    const handleOnSubmit = form.onSubmit(({ defaultProjectUuid }) => {
        updateOrganization({ defaultProjectUuid: defaultProjectUuid });
    });

    return (
        <form onSubmit={handleOnSubmit}>
            <Stack>
                <Select
                    label="Project name"
                    data={projects
                        .filter(({ type }) => type !== ProjectType.PREVIEW)
                        .map((project) => ({
                            value: project.projectUuid,
                            label: project.name,
                        }))}
                    disabled={isLoading}
                    required
                    placeholder="No project selected"
                    dropdownPosition="bottom"
                    {...form.getInputProps('defaultProjectUuid')}
                />
                <Button
                    display="block"
                    ml="auto"
                    type="submit"
                    disabled={isLoading}
                    loading={isLoading}
                >
                    Update
                </Button>
            </Stack>
        </form>
    );
};

export default DefaultProjectPanel;
