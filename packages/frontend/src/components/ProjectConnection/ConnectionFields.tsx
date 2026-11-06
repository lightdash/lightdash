import {
    WAREHOUSE_CONNECTION_NAME_MAX_LENGTH,
    type Project,
    type WarehouseTypes,
} from '@lightdash/common';
import { Stack, Text, TextInput } from '@mantine/core';
import { type FC } from 'react';
import { useWarehouseConnections } from '../../hooks/useWarehouseConnections';
import { FormProvider, type Form } from './formContext';
import { ProjectFormProvider } from './ProjectFormProvider';
import WarehouseSchemaInput from './WarehouseSchemaInput';
import WarehouseSettingsForm from './WarehouseSettingsForm';

export const ConnectionFields: FC<{
    form: Form;
    intro: string;
    projectUuid: string;
    warehouseConnectionUuid?: string | null;
    warehouseType: WarehouseTypes;
    nameRef?: React.Ref<HTMLInputElement>;
    savedProject?: Project;
    primaryRequiresUserCredentials?: boolean;
    showName: boolean;
    allowMixedWarehouseTypes: boolean;
}> = ({
    form,
    intro,
    projectUuid,
    warehouseConnectionUuid,
    warehouseType,
    nameRef,
    savedProject,
    primaryRequiresUserCredentials,
    showName,
    allowMixedWarehouseTypes,
}) => {
    const { data } = useWarehouseConnections(projectUuid);
    const originalWarehouseType =
        data?.connections.find((connection) => connection.isOriginal)
            ?.warehouseType ?? warehouseType;
    return (
        <FormProvider form={form}>
            <ProjectFormProvider
                projectUuid={projectUuid}
                warehouseConnectionUuid={warehouseConnectionUuid}
                savedProject={savedProject}
                isProjectExtraConnection
                inheritsPrimaryCredentialRequirement={
                    originalWarehouseType === form.values.warehouse.type
                }
                primaryRequiresUserCredentials={
                    originalWarehouseType === form.values.warehouse.type
                        ? primaryRequiresUserCredentials
                        : undefined
                }
            >
                <Stack gap="md">
                    <Text size="sm" c="dimmed">
                        {intro}
                    </Text>
                    {showName && (
                        <TextInput
                            ref={nameRef}
                            label="Name"
                            description="Shown wherever this connection is picked."
                            placeholder="e.g. Finance warehouse"
                            required
                            maxLength={WAREHOUSE_CONNECTION_NAME_MAX_LENGTH}
                            {...form.getInputProps('name')}
                        />
                    )}
                    <WarehouseSettingsForm
                        disabled={false}
                        allowMixedWarehouseTypes={allowMixedWarehouseTypes}
                    >
                        <WarehouseSchemaInput
                            warehouseType={form.values.warehouse.type}
                            disabled={false}
                            warehouseOnly
                        />
                    </WarehouseSettingsForm>
                </Stack>
            </ProjectFormProvider>
        </FormProvider>
    );
};
