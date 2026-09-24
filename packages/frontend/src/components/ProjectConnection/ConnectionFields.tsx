import {
    WAREHOUSE_CONNECTION_NAME_MAX_LENGTH,
    type Project,
    type WarehouseTypes,
} from '@lightdash/common';
import { Stack, Text, TextInput } from '@mantine/core';
import { type FC } from 'react';
import { FormProvider, type Form } from './formContext';
import { ProjectFormProvider } from './ProjectFormProvider';
import WarehouseSchemaInput from './WarehouseSchemaInput';
import WarehouseSettingsForm from './WarehouseSettingsForm';

export const ConnectionFields: FC<{
    form: Form;
    intro: string;
    projectUuid: string;
    warehouseType: WarehouseTypes;
    nameRef?: React.Ref<HTMLInputElement>;
    savedProject?: Project;
    showName: boolean;
}> = ({
    form,
    intro,
    projectUuid,
    warehouseType,
    nameRef,
    savedProject,
    showName,
}) => (
    <FormProvider form={form}>
        <ProjectFormProvider
            projectUuid={projectUuid}
            savedProject={savedProject}
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
                <WarehouseSettingsForm disabled={false}>
                    <WarehouseSchemaInput
                        warehouseType={warehouseType}
                        disabled={false}
                        warehouseOnly
                    />
                </WarehouseSettingsForm>
            </Stack>
        </ProjectFormProvider>
    </FormProvider>
);
