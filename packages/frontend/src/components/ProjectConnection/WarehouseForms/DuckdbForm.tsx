import {
    DuckdbConnectionType,
    DucklakeCatalogType,
    DucklakeDataPathType,
    FeatureFlags,
    WarehouseTypes,
} from '@lightdash/common';
import {
    NumberInput,
    PasswordInput,
    SegmentedControl,
    Select,
    Stack,
    Switch,
    TextInput,
} from '@mantine/core';
import { type FC } from 'react';
import { useToggle } from 'react-use';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import TimeZonePicker from '../../common/TimeZonePicker';
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
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

const DATA_PATH_TYPE_OPTIONS = [
    { value: DucklakeDataPathType.S3, label: 'S3-compatible' },
    { value: DucklakeDataPathType.GCS, label: 'Google Cloud Storage' },
    { value: DucklakeDataPathType.AZURE, label: 'Azure Blob Storage' },
    { value: DucklakeDataPathType.LOCAL, label: 'Local filesystem' },
];

export const DuckdbSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const form = useFormContext();

    return (
        <TextInput
            name="warehouse.schema"
            label="Schema"
            description="The default schema for your DuckDB connection."
            required
            {...form.getInputProps('warehouse.schema')}
            disabled={disabled}
        />
    );
};

const MotherDuckFields: FC<{ disabled: boolean }> = ({ disabled }) => {
    const form = useFormContext();
    return (
        <>
            <TextInput
                name="warehouse.database"
                label="Database"
                description="Your MotherDuck database name, for example `my_db`."
                required
                {...form.getInputProps('warehouse.database')}
                disabled={disabled}
            />
            <TextInput
                name="warehouse.schema"
                label="Schema"
                description="The default schema in MotherDuck, usually `main`."
                required
                {...form.getInputProps('warehouse.schema')}
                disabled={disabled}
                placeholder="main"
            />
            <PasswordInput
                name="warehouse.token"
                label="Access token"
                description="Create an access token in MotherDuck Settings."
                placeholder={disabled ? '**************' : undefined}
                {...form.getInputProps('warehouse.token')}
                disabled={disabled}
            />
        </>
    );
};

const DucklakeFields: FC<{ disabled: boolean }> = ({ disabled }) => {
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
                label="Schema"
                description="The default DuckLake schema your queries will use."
                required
                placeholder="main"
                {...form.getInputProps('warehouse.schema')}
                disabled={disabled}
            />
            <TextInput
                name="warehouse.catalogAlias"
                label="Catalog alias"
                description="Name used to attach the DuckLake catalog (defaults to `ducklake`)."
                placeholder="ducklake"
                {...form.getInputProps('warehouse.catalogAlias')}
                disabled={disabled}
            />
            <Select
                label="Catalog backend"
                description="Database that stores DuckLake catalog metadata."
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
                        label="Host"
                        required
                        {...form.getInputProps('warehouse.catalog.host')}
                        disabled={disabled}
                    />
                    <NumberInput
                        label="Port"
                        required
                        {...form.getInputProps('warehouse.catalog.port')}
                        disabled={disabled}
                    />
                    <TextInput
                        label="Database"
                        required
                        {...form.getInputProps('warehouse.catalog.database')}
                        disabled={disabled}
                    />
                    <TextInput
                        label="User"
                        required
                        {...form.getInputProps('warehouse.catalog.user')}
                        disabled={disabled}
                    />
                    <PasswordInput
                        label="Password"
                        placeholder={disabled ? '**************' : undefined}
                        {...form.getInputProps('warehouse.catalog.password')}
                        disabled={disabled}
                    />
                </>
            )}

            {(catalogType === DucklakeCatalogType.SQLITE ||
                catalogType === DucklakeCatalogType.DUCKDB) && (
                <TextInput
                    label="Catalog file path"
                    description="Path to the catalog database file on the Lightdash server."
                    required
                    {...form.getInputProps('warehouse.catalog.path')}
                    disabled={disabled}
                />
            )}

            <Select
                label="Data path backend"
                description="Where DuckLake stores Parquet data files."
                data={DATA_PATH_TYPE_OPTIONS}
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
                        label="S3 URL"
                        description="e.g. s3://my-bucket/path/"
                        required
                        {...form.getInputProps('warehouse.dataPath.url')}
                        disabled={disabled}
                    />
                    <TextInput
                        label="Endpoint"
                        description="Override for S3-compatible providers (leave empty for AWS)."
                        {...form.getInputProps('warehouse.dataPath.endpoint')}
                        disabled={disabled}
                    />
                    <TextInput
                        label="Region"
                        {...form.getInputProps('warehouse.dataPath.region')}
                        disabled={disabled}
                    />
                    <TextInput
                        label="Access key ID"
                        description="Leave blank to use the SDK credential chain (IAM role, web identity, …)."
                        {...form.getInputProps(
                            'warehouse.dataPath.accessKeyId',
                        )}
                        disabled={disabled}
                    />
                    <PasswordInput
                        label="Secret access key"
                        placeholder={disabled ? '**************' : undefined}
                        {...form.getInputProps(
                            'warehouse.dataPath.secretAccessKey',
                        )}
                        disabled={disabled}
                    />
                    <Switch
                        label="Use path-style URLs"
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
                        label="GCS URL"
                        description="e.g. gs://my-bucket/path/"
                        required
                        {...form.getInputProps('warehouse.dataPath.url')}
                        disabled={disabled}
                    />
                    <TextInput
                        label="HMAC key ID"
                        description="Leave blank to use the SDK credential chain."
                        {...form.getInputProps('warehouse.dataPath.hmacKeyId')}
                        disabled={disabled}
                    />
                    <PasswordInput
                        label="HMAC secret"
                        placeholder={disabled ? '**************' : undefined}
                        {...form.getInputProps('warehouse.dataPath.hmacSecret')}
                        disabled={disabled}
                    />
                </>
            )}

            {dataPathType === DucklakeDataPathType.AZURE && (
                <>
                    <TextInput
                        label="Azure Blob URL"
                        description="e.g. azure://container/path/ or abfss://container@account.dfs.core.windows.net/path/"
                        required
                        {...form.getInputProps('warehouse.dataPath.url')}
                        disabled={disabled}
                    />
                    <PasswordInput
                        label="Connection string"
                        description="If set, takes precedence over account name + key."
                        placeholder={disabled ? '**************' : undefined}
                        {...form.getInputProps(
                            'warehouse.dataPath.connectionString',
                        )}
                        disabled={disabled}
                    />
                    <TextInput
                        label="Account name"
                        {...form.getInputProps(
                            'warehouse.dataPath.accountName',
                        )}
                        disabled={disabled}
                    />
                    <PasswordInput
                        label="Account key"
                        placeholder={disabled ? '**************' : undefined}
                        {...form.getInputProps('warehouse.dataPath.accountKey')}
                        disabled={disabled}
                    />
                </>
            )}

            {dataPathType === DucklakeDataPathType.LOCAL && (
                <TextInput
                    label="Local data path"
                    description="Server-local directory. Only viable for single-pod deployments."
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
    const [isOpen, toggleOpen] = useToggle(false);
    const form = useFormContext();
    const { data: timezoneSupportFlag } = useServerFeatureFlag(
        FeatureFlags.EnableTimezoneSupport,
    );
    const isTimezoneSupportEnabled = timezoneSupportFlag?.enabled ?? false;

    const warehouse = form.values.warehouse;
    const connectionType =
        warehouse?.type === WarehouseTypes.DUCKDB
            ? (warehouse.connectionType ?? DuckdbConnectionType.MOTHERDUCK)
            : DuckdbConnectionType.MOTHERDUCK;

    return (
        <Stack mt="sm">
            <SegmentedControl
                data={CONNECTION_TYPE_OPTIONS}
                value={connectionType}
                onChange={(value) => {
                    if (value === connectionType) return;
                    if (value === DuckdbConnectionType.DUCKLAKE) {
                        form.setValues({
                            ...form.values,
                            warehouse: { ...DuckdbDucklakeDefaultValues },
                        });
                    } else {
                        form.setValues({
                            ...form.values,
                            warehouse: { ...DuckdbMotherduckDefaultValues },
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
                        label="Threads"
                        description="Number of threads for dbt to use."
                        defaultValue={1}
                        {...form.getInputProps('warehouse.threads')}
                        disabled={disabled}
                    />

                    {isTimezoneSupportEnabled && (
                        <TimeZonePicker
                            size="sm"
                            maw="100%"
                            label="Data timezone"
                            description="The timezone your warehouse stores ambiguous timestamps in. Defaults to UTC if not set."
                            searchable
                            clearable
                            placeholder="Not set (uses warehouse default)"
                            disabled={disabled}
                            {...form.getInputProps('warehouse.dataTimezone')}
                        />
                    )}
                    <StartOfWeekSelect disabled={disabled} />
                </Stack>
            </FormSection>
            <FormCollapseButton isSectionOpen={isOpen} onClick={toggleOpen}>
                Advanced configuration options
            </FormCollapseButton>
        </Stack>
    );
};

export default DuckdbForm;
