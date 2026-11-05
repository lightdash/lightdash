import { ProjectType } from '@lightdash/common';
import { Button, Group, Select } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, type FC } from 'react';
import { z } from 'zod';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useOrganizationUpdateMutation } from '../../../hooks/organization/useOrganizationUpdateMutation';
import { useProjects } from '../../../hooks/useProjects';
import { SettingRow } from '../../common/Settings/SettingLayout';

const validationSchema = z.object({
    defaultProjectUuid: z.string().or(z.undefined()),
});

type FormValues = z.infer<typeof validationSchema>;

const DefaultProjectPanel: FC = () => {
    const { isLoading: isOrganizationLoading, data: organizationData } =
        useOrganization();
    const { isLoading: isLoadingProjects, data: projects = [] } = useProjects();

    const {
        isLoading: isOrganizationUpdateLoading,
        mutate: updateOrganization,
    } = useOrganizationUpdateMutation();

    const isLoading =
        isOrganizationUpdateLoading ||
        isOrganizationLoading ||
        isLoadingProjects;

    const form = useForm<FormValues>({
        initialValues: {
            defaultProjectUuid: undefined,
        },
    });

    useEffect(() => {
        if (isOrganizationLoading || !organizationData) return;

        const initialData = {
            defaultProjectUuid: organizationData.defaultProjectUuid,
        };

        form.setInitialValues(initialData);
        form.setValues(initialData);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOrganizationLoading, organizationData]);

    const handleOnSubmit = form.onSubmit(({ defaultProjectUuid }) => {
        if (!form.isValid) return;
        updateOrganization({ defaultProjectUuid: defaultProjectUuid });
    });

    return (
        <SettingRow
            title="Default project"
            description="The project users see when they log in for the first time or from a new device. Users without access see their next accessible project."
            control={
                <form onSubmit={handleOnSubmit}>
                    <Group gap="xs" align="flex-start">
                        <Select
                            allowDeselect={false}
                            key={form.values.defaultProjectUuid}
                            aria-label="Default project"
                            size="xs"
                            w={260}
                            data={projects
                                // Neither previews nor the training playground can
                                // be the org's landing project.
                                .filter(
                                    ({ type }) =>
                                        type !== ProjectType.PREVIEW &&
                                        type !== ProjectType.TRAINING,
                                )
                                .map((project) => ({
                                    value: project.projectUuid,
                                    label: project.name,
                                }))}
                            disabled={isLoading}
                            required
                            placeholder="No project selected"
                            comboboxProps={{
                                position: 'bottom',
                                middlewares: { flip: false },
                            }}
                            {...form.getInputProps('defaultProjectUuid')}
                        />
                        {form.isDirty() && !isOrganizationUpdateLoading && (
                            <Button
                                size="xs"
                                variant="default"
                                onClick={() => form.reset()}
                            >
                                Cancel
                            </Button>
                        )}
                        <Button
                            size="xs"
                            type="submit"
                            disabled={isLoading || !form.isDirty()}
                            loading={isLoading}
                        >
                            Update
                        </Button>
                    </Group>
                </form>
            }
        />
    );
};

export default DefaultProjectPanel;
