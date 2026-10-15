import {
    WAREHOUSE_CONNECTION_NAME_MAX_LENGTH,
    type Project,
    type WarehouseTypes,
} from '@lightdash/common';
import { Stack, Text, TextInput } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
}) => {
    const { t } = useTranslation('projectConnection');
    return (
        <FormProvider form={form}>
            <ProjectFormProvider
                projectUuid={projectUuid}
                warehouseConnectionUuid={warehouseConnectionUuid}
                savedProject={savedProject}
                isProjectExtraConnection
                primaryRequiresUserCredentials={primaryRequiresUserCredentials}
            >
                <Stack gap="md">
                    <Text size="sm" c="dimmed">
                        {intro}
                    </Text>
                    {showName && (
                        <TextInput
                            ref={nameRef}
                            label={t('connectionFields.nameLabel')}
                            description={t('connectionFields.nameDescription')}
                            placeholder={t('connectionFields.namePlaceholder')}
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
};
