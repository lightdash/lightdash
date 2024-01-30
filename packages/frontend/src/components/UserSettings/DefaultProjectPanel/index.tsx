import { ProjectType } from '@lightdash/common';
import { Button, Flex, Select, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import React, { FC, useCallback, useEffect } from 'react';
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

    const setFormValuesFromData = useCallback(() => {
        if (data) {
            form.setValues({
                defaultProjectUuid: data?.defaultProjectUuid,
            });
            form.resetDirty({
                defaultProjectUuid: data?.defaultProjectUuid,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    useEffect(() => {
        setFormValuesFromData();
    }, [setFormValuesFromData]);

    const handleOnSubmit = form.onSubmit(({ defaultProjectUuid }) => {
        updateOrganization({ defaultProjectUuid: defaultProjectUuid });
    });

    return (
        <form onSubmit={handleOnSubmit}>
            <Stack>
                <Select
                    key={form.values.defaultProjectUuid}
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

                <Flex justify="flex-end" gap="sm">
                    {form.isDirty() && (
                        <Button
                            variant="outline"
                            onClick={() => {
                                setFormValuesFromData();
                            }}
                        >
                            Cancel
                        </Button>
                    )}
                    <Button
                        display="block"
                        type="submit"
                        disabled={isLoading || !form.isDirty()}
                        loading={isLoading}
                    >
                        Update
                    </Button>
                </Flex>
            </Stack>
        </form>
    );
};

export default DefaultProjectPanel;
