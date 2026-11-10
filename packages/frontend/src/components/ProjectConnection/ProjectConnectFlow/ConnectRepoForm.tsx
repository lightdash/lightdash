import {
    DbtProjectType,
    type CreateWarehouseCredentials,
    type Project,
} from '@lightdash/common';
import { Button, Group, Stack } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import { useUpdateMutation } from '../../../hooks/useProject';
import { dbtDefaults } from '../DbtForms/defaultValues';
import { dbtFormValidators } from '../DbtForms/validators';
import DbtSettingsForm from '../DbtSettingsForm';
import { FormProvider, useForm } from '../formContext';
import { ProjectFormProvider } from '../ProjectFormProvider';
import { type ProjectConnectionForm } from '../types';
import { useOnProjectError } from '../useOnProjectError';
import { warehouseDefaultValues } from '../WarehouseForms/defaultValues';

// Adds a repo to a project saved warehouse-only; the compile runs as a background job with its own toasts
export const ConnectRepoForm: FC<{
    project: Project;
    onConnected: () => void;
    footerStart: ReactNode;
}> = ({ project, onConnected, footerStart }) => {
    const { mutateAsync, isLoading } = useUpdateMutation(project.projectUuid);
    const onProjectError = useOnProjectError();

    const warehouseType = project.warehouseConnection?.type;
    const form = useForm({
        initialValues: {
            name: project.name,
            dbt: dbtDefaults.formValues[DbtProjectType.GITHUB],
            warehouse: {
                ...(warehouseType ? warehouseDefaultValues[warehouseType] : {}),
                ...project.warehouseConnection,
            } as CreateWarehouseCredentials,
            dbtVersion: project.dbtVersion,
        },
        validate: { dbt: dbtFormValidators },
        validateInputOnBlur: true,
    });

    const handleSubmit = async ({
        name,
        dbt,
        warehouse,
        dbtVersion,
    }: ProjectConnectionForm) => {
        try {
            await mutateAsync({
                name,
                dbtConnection: dbt,
                warehouseConnection: warehouse,
                dbtVersion,
            });
        } catch {
            return; // the mutation already shows the error
        }
        onConnected();
    };

    return (
        <FormProvider form={form}>
            <form onSubmit={form.onSubmit(handleSubmit, onProjectError)}>
                <Stack gap="lg">
                    <ProjectFormProvider revealAfterSignIn>
                        <DbtSettingsForm
                            disabled={isLoading}
                            typePicker="tiles"
                        />
                    </ProjectFormProvider>
                    <Group justify="space-between" data-form-footer>
                        {footerStart}
                        <Button type="submit" loading={isLoading}>
                            Connect repo
                        </Button>
                    </Group>
                </Stack>
            </form>
        </FormProvider>
    );
};
