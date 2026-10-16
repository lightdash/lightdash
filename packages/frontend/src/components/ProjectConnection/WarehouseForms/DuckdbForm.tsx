import {
    DuckdbConnectionType,
    DucklakeCatalogType,
    DucklakeDataPathType,
    WarehouseTypes,
} from '@lightdash/common';
import {
    TextInput,
    Stack,
    SegmentedControl,
    Select,
    Switch,
    PasswordInput,
} from '@mantine/core';
import { type TFunction } from 'i18next';
import { type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';
import { NumberInput } from '../../common/NumberInput';
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import DataTimezoneField from './DataTimezoneField';
import {
    DuckdbDucklakeDefaultValues,
    DuckdbMotherduckDefaultValues,
} from './defaultValues';

const CONNECTION_TYPE_OPTIONS = [
    { value: DuckdbConnectionType.MOTHERDUCK, label: 'MotherDuck' },
    { value: DuckdbConnectionType.DUCKLAKE, label: 'DuckLake' },
];

const CATALOG_TYPE_OPTIONS = [
    { value: DucklakeCatalogType.POSTGRES, label: 'PostgreSQL' },
    { value: DucklakeCatalogType.SQLITE, label: 'SQLite' },
    { value: DucklakeCatalogType.DUCKDB, label: 'DuckDB' },
];

const getDataPathTypeOptions = (t: TFunction) => [
    {
        value: DucklakeDataPathType.S3,
        label: t('warehouseFields.s3Compatible'),
    },
    {
        value: DucklakeDataPathType.GCS,
        label: t('warehouseFields.googleCloudStorage'),
    },
    {
        value: DucklakeDataPathType.AZURE,
        label: t('warehouseFields.azureBlobStorage'),
    },
    {
        value: DucklakeDataPathType.LOCAL,
        label: t('warehouseFields.localFilesystem'),
    },
];

export const DuckdbSchemaInput: FC<{
    disabled: boolean;
    description?: ReactNode;
}> = ({ disabled, description }) => {
    const { t } = useTranslation('projectConnection');
    const form = useFormContext();

    return (
        <TextInput
            name="warehouse.schema"
            label={t('warehouseFields.schema')}
            description={
                description ?? t('warehouseFields.duckdbSchemaDescription')
            }
            required
            {...form.getInputProps('warehouse.schema')}
            disabled={disabled}
        />
    );
};

const MotherDuckFields: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { t } = useTranslation('projectConnection');
    const form = useFormContext();
    return (
        <>
            <TextInput
                name="warehouse.database"
                label={t('warehouseFields.database')}
                description={t('warehouseFields.motherduckDatabaseDescription')}
                required
                {...form.getInputProps('warehouse.database')}
                disabled={disabled}
            />
            <TextInput
                name="warehouse.schema"
                label={t('warehouseFields.schema')}
                description={t('warehouseFields.motherduckSchemaDescription')}
                required
                {...form.getInputProps('warehouse.schema')}
                disabled={disabled}
                placeholder="main"
            />
            <PasswordInput
                name="warehouse.token"
                label={t('warehouseFields.accessToken')}
                description={t('warehouseFields.motherduckTokenDescription')}
                placeholder={disabled ? '**************' : undefined}
                {...form.getInputProps('warehouse.token')}
                disabled={disabled}
            />
        </>
    );
};

const DucklakeFields: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { t } = useTranslation('projectConnection');
    const form = useFormContext();
    const warehouse = form.values.warehouse;
    if (
        warehouse?.type !== WarehouseTypes.DUCKDB ||
        warehouse.connectionType !== DuckdbConnectionType.DUCKLAKE
    ) {
        return null;
    }

    const catalogType = warehouse.catalog?.type;
    const dataPathType = warehouse.dataPath?.type;

    return (
        <>
            <TextInput
                name="warehouse.schema"
                label={t('warehouseFields.schema')}
                description={t('warehouseFields.ducklakeSchemaDescription')}
                required
                placeholder="main"
                {...form.getInputProps('warehouse.schema')}
                disabled={disabled}
            />
            <TextInput
                name="warehouse.catalogAlias"
                label={t('warehouseFields.catalogAlias')}
                description={t('warehouseFields.catalogAliasDescription')}
                placeholder="ducklake"
                {...form.getInputProps('warehouse.catalogAlias')}
                disabled={disabled}
            />
            <Select
                allowDeselect={false}
                label={t('warehouseFields.catalogBackend')}
                description={t('warehouseFields.catalogBackendDescription')}
                data={CATALOG_TYPE_OPTIONS}
                value={catalogType}
                onChange={(value) => {
                    if (!value) return;
                    if (value === DucklakeCatalogType.POSTGRES) {
                        form.setFieldValue('warehouse.catalog', {
                            type: DucklakeCatalogType.POSTGRES,
                            host: '',
                            port: 5432,
                            database: '',
                            user: '',
                            password: '',
                        });
                    } else {
                        form.setFieldValue('warehouse.catalog', {
                            type: value as
                                | DucklakeCatalogType.SQLITE
                                | DucklakeCatalogType.DUCKDB,
                            path: '',
                        });
                    }
                }}
                disabled={disabled}
                required
            />

            {catalogType === DucklakeCatalogType.POSTGRES && (
                <>
                    <TextInput
                        label={t('warehouseFields.host')}
                        required
                        {...form.getInputProps('warehouse.catalog.host')}
                        disabled={disabled}
                    />
                    <NumberInput
                        label={t('warehouseFields.port')}
                        required
                        {...form.getInputProps('warehouse.catalog.port')}
                        disabled={disabled}
                    />
                    <TextInput
                        label={t('warehouseFields.database')}
                        required
                        {...form.getInputProps('warehouse.catalog.database')}
                        disabled={disabled}
                    />
                    <TextInput
                        label={t('warehouseFields.user')}
                        required
                        {...form.getInputProps('warehouse.catalog.user')}
                        disabled={disabled}
                    />
                    <PasswordInput
                        label={t('warehouseFields.password')}
                        placeholder={disabled ? '**************' : undefined}
                        {...form.getInputProps('warehouse.catalog.password')}
                        disabled={disabled}
                    />
                </>
            )}

            {(catalogType === DucklakeCatalogType.SQLITE ||
                catalogType === DucklakeCatalogType.DUCKDB) && (
                <TextInput
                    label={t('warehouseFields.catalogFilePath')}
                    description={t(
                        'warehouseFields.catalogFilePathDescription',
                    )}
                    required
                    {...form.getInputProps('warehouse.catalog.path')}
                    disabled={disabled}
                />
            )}

            <Select
                allowDeselect={false}
                label={t('warehouseFields.dataPathBackend')}
                description={t('warehouseFields.dataPathDescription')}
                data={getDataPathTypeOptions(t)}
                value={dataPathType}
                onChange={(value) => {
                    if (!value) return;
                    if (value === DucklakeDataPathType.S3) {
                        form.setFieldValue('warehouse.dataPath', {
                            type: value,
                            url: '',
                            accessKeyId: '',
                            secretAccessKey: '',
                        });
                    } else if (value === DucklakeDataPathType.GCS) {
                        form.setFieldValue('warehouse.dataPath', {
                            type: value,
                            url: '',
                            hmacKeyId: '',
                            hmacSecret: '',
                        });
                    } else if (value === DucklakeDataPathType.AZURE) {
                        form.setFieldValue('warehouse.dataPath', {
                            type: value,
                            url: '',
                            accountName: '',
                            accountKey: '',
                        });
                    } else {
                        form.setFieldValue('warehouse.dataPath', {
                            type: DucklakeDataPathType.LOCAL,
                            path: '',
                        });
                    }
                }}
                disabled={disabled}
                required
            />

            {dataPathType === DucklakeDataPathType.S3 && (
                <>
                    <TextInput
                        label={t('warehouseFields.s3Url')}
                        description={t('warehouseFields.s3UrlDescription')}
                        required
                        {...form.getInputProps('warehouse.dataPath.url')}
                        disabled={disabled}
                    />
                    <TextInput
                        label={t('warehouseFields.endpoint')}
                        description={t('warehouseFields.endpointDescription')}
                        {...form.getInputProps('warehouse.dataPath.endpoint')}
                        disabled={disabled}
                    />
                    <TextInput
                        label={t('warehouseFields.region')}
                        {...form.getInputProps('warehouse.dataPath.region')}
                        disabled={disabled}
                    />
                    <TextInput
                        label={t('warehouseFields.accessKeyId')}
                        description={t(
                            'warehouseFields.sdkCredentialChainDetailed',
                        )}
                        {...form.getInputProps(
                            'warehouse.dataPath.accessKeyId',
                        )}
                        disabled={disabled}
                    />
                    <PasswordInput
                        label={t('warehouseFields.secretAccessKey')}
                        placeholder={disabled ? '**************' : undefined}
                        {...form.getInputProps(
                            'warehouse.dataPath.secretAccessKey',
                        )}
                        disabled={disabled}
                    />
                    <Switch
                        label={t('warehouseFields.usePathStyleUrls')}
                        {...form.getInputProps(
                            'warehouse.dataPath.forcePathStyle',
                            { type: 'checkbox' },
                        )}
                        disabled={disabled}
                    />
                </>
            )}

            {dataPathType === DucklakeDataPathType.GCS && (
                <>
                    <TextInput
                        label={t('warehouseFields.gcsUrl')}
                        description={t('warehouseFields.gcsUrlDescription')}
                        required
                        {...form.getInputProps('warehouse.dataPath.url')}
                        disabled={disabled}
                    />
                    <TextInput
                        label={t('warehouseFields.hmacKeyId')}
                        description={t('warehouseFields.sdkCredentialChain')}
                        {...form.getInputProps('warehouse.dataPath.hmacKeyId')}
                        disabled={disabled}
                    />
                    <PasswordInput
                        label={t('warehouseFields.hmacSecret')}
                        placeholder={disabled ? '**************' : undefined}
                        {...form.getInputProps('warehouse.dataPath.hmacSecret')}
                        disabled={disabled}
                    />
                </>
            )}

            {dataPathType === DucklakeDataPathType.AZURE && (
                <>
                    <TextInput
                        label={t('warehouseFields.azureBlobUrl')}
                        description={t(
                            'warehouseFields.azureBlobUrlDescription',
                        )}
                        required
                        {...form.getInputProps('warehouse.dataPath.url')}
                        disabled={disabled}
                    />
                    <PasswordInput
                        label={t('warehouseFields.connectionString')}
                        description={t(
                            'warehouseFields.connectionStringDescription',
                        )}
                        placeholder={disabled ? '**************' : undefined}
                        {...form.getInputProps(
                            'warehouse.dataPath.connectionString',
                        )}
                        disabled={disabled}
                    />
                    <TextInput
                        label={t('warehouseFields.accountName')}
                        {...form.getInputProps(
                            'warehouse.dataPath.accountName',
                        )}
                        disabled={disabled}
                    />
                    <PasswordInput
                        label={t('warehouseFields.accountKey')}
                        placeholder={disabled ? '**************' : undefined}
                        {...form.getInputProps('warehouse.dataPath.accountKey')}
                        disabled={disabled}
                    />
                </>
            )}

            {dataPathType === DucklakeDataPathType.LOCAL && (
                <TextInput
                    label={t('warehouseFields.localDataPath')}
                    description={t('warehouseFields.localDataPathDescription')}
                    required
                    {...form.getInputProps('warehouse.dataPath.path')}
                    disabled={disabled}
                />
            )}
        </>
    );
};

const DuckdbForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { t } = useTranslation('projectConnection');
    const [isOpen, toggleOpen] = useToggle(false);
    const form = useFormContext();

    const warehouse = form.values.warehouse;
    const connectionType =
        warehouse?.type === WarehouseTypes.DUCKDB
            ? (warehouse.connectionType ?? DuckdbConnectionType.MOTHERDUCK)
            : DuckdbConnectionType.MOTHERDUCK;

    if (connectionType === DuckdbConnectionType.EMBEDDED) return null;

    return (
        <Stack mt="sm">
            <SegmentedControl
                data={CONNECTION_TYPE_OPTIONS}
                value={connectionType}
                onChange={(value) => {
                    if (value === connectionType) return;
                    if (value === DuckdbConnectionType.DUCKLAKE) {
                        form.setFieldValue('warehouse', {
                            ...DuckdbDucklakeDefaultValues,
                        });
                    } else {
                        form.setFieldValue('warehouse', {
                            ...DuckdbMotherduckDefaultValues,
                        });
                    }
                }}
                disabled={disabled}
            />

            {connectionType === DuckdbConnectionType.MOTHERDUCK ? (
                <MotherDuckFields disabled={disabled} />
            ) : (
                <DucklakeFields disabled={disabled} />
            )}

            <FormSection isOpen={isOpen} name="advanced">
                <Stack mt="sm">
                    <NumberInput
                        name="warehouse.threads"
                        label={t('warehouseFields.threads')}
                        description={t('warehouseFields.threadsDescription')}
                        defaultValue={1}
                        {...form.getInputProps('warehouse.threads')}
                        disabled={disabled}
                    />

                    <DataTimezoneField disabled={disabled} />
                    <StartOfWeekSelect disabled={disabled} />
                </Stack>
            </FormSection>
            <FormCollapseButton isSectionOpen={isOpen} onClick={toggleOpen}>
                {t('dbtSettings.advancedOptions')}
            </FormCollapseButton>
        </Stack>
    );
};

export default DuckdbForm;
