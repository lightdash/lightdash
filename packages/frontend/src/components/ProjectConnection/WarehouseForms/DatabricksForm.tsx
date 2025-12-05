import {
    DatabricksAuthenticationType,
    WarehouseTypes,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    Group,
    PasswordInput,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconCheck, IconPlus, IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import { useToggle } from 'react-use';
import { v4 as uuidv4 } from 'uuid';
import {
    useDatabricksLoginPopup,
    useIsDatabricksAuthenticated,
} from '../../../hooks/useDatabricks';
import MantineIcon from '../../common/MantineIcon';
import FormCollapseButton from '../FormCollapseButton';
import BooleanSwitch from '../Inputs/BooleanSwitch';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { getWarehouseIcon } from '../ProjectConnectFlow/utils';
import { useFormContext } from '../formContext';
import { useProjectFormContext } from '../useProjectFormContext';
import { DatabricksDefaultValues } from './defaultValues';
import { getSsoLabel, PERSONAL_ACCESS_TOKEN_LABEL } from './util';

export const DatabricksSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const form = useFormContext();

    return (
        <TextInput
            // this supposed to be a `schema` but changing it will break for existing customers
            name="warehouse.database"
            {...form.getInputProps('warehouse.database')}
            label="Schema"
            description={
                <p>
                    Check out for more details in{' '}
                    <Anchor
                        target="_blank"
                        href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project/#database-1"
                        rel="noreferrer"
                    >
                        given documentation
                    </Anchor>
                    .
                </p>
            }
            required
            disabled={disabled}
        />
    );
};

export const DatabricksSSOInput: FC<{
    isAuthenticated: boolean;
    disabled: boolean;
    openLoginPopup: () => void;
}> = ({ isAuthenticated, disabled, openLoginPopup }) => {
    if (isAuthenticated) return null;

    return (
        <Button
            onClick={() => {
                openLoginPopup();
            }}
            variant="default"
            color="gray"
            disabled={disabled}
            leftIcon={getWarehouseIcon(WarehouseTypes.DATABRICKS, 'sm')}
            sx={{ ':hover': { textDecoration: 'underline' } }}
        >
            Sign in with Databricks
        </Button>
    );
};

const DatabricksForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const form = useFormContext();
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.DATABRICKS;

    const {
        data,
        isLoading: isLoadingAuth,
        error: databricksAuthError,
        refetch: refetchAuth,
    } = useIsDatabricksAuthenticated();

    const isSso =
        form.values.warehouse?.type === WarehouseTypes.DATABRICKS &&
        form.values.warehouse.authenticationType ===
            DatabricksAuthenticationType.OAUTH_U2M;

    const isAuthenticated =
        data !== undefined && databricksAuthError === null && isSso;

    const { mutate: openLoginPopup, isSsoEnabled } = useDatabricksLoginPopup({
        onLogin: async () => {
            await refetchAuth();
        },
    });

    if (form.values.warehouse?.type !== WarehouseTypes.DATABRICKS) {
        throw new Error(
            'Databricks form is not available for this warehouse type',
        );
    }

    const savedAuthType =
        savedProject?.warehouseConnection?.type === WarehouseTypes.DATABRICKS
            ? savedProject?.warehouseConnection?.authenticationType
            : undefined;

    const defaultAuthType = savedAuthType
        ? savedAuthType
        : isSsoEnabled
        ? DatabricksAuthenticationType.OAUTH_U2M
        : DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN;

    if (!form.isTouched()) {
        form.setFieldValue('warehouse.authenticationType', defaultAuthType);
    }

    const authenticationType: DatabricksAuthenticationType =
        form.values.warehouse.authenticationType ?? defaultAuthType;

    // Build authentication options based on SSO availability
    const authOptions = isSsoEnabled
        ? [
              {
                  value: DatabricksAuthenticationType.OAUTH_U2M,
                  label: getSsoLabel(WarehouseTypes.DATABRICKS),
              },
              {
                  value: DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN,
                  label: PERSONAL_ACCESS_TOKEN_LABEL,
              },
          ]
        : [
              {
                  value: DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN,
                  label: PERSONAL_ACCESS_TOKEN_LABEL,
              },
          ];

    const computes = form.values.warehouse?.compute ?? [];
    const addCompute = () => {
        form.insertListItem('warehouse.compute', {
            key: uuidv4(),
            name: '',
            httpPath: '',
        });
    };
    const removeCompute = (index: number) => {
        form.removeListItem('warehouse.compute', index);
    };

    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
                    name="warehouse.serverHostName"
                    {...form.getInputProps('warehouse.serverHostName')}
                    label="Server host name"
                    description={
                        <p>
                            Check out for more details in{' '}
                            <Anchor
                                target="_blank"
                                href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#server-hostname"
                                rel="noreferrer"
                            >
                                given documentation
                            </Anchor>
                            .
                        </p>
                    }
                    required
                    disabled={disabled}
                    placeholder="xxxx.gcp.databricks.com"
                    labelProps={{ style: { marginTop: '8px' } }}
                />
                <TextInput
                    name="warehouse.httpPath"
                    {...form.getInputProps('warehouse.httpPath')}
                    label="HTTP Path"
                    description={
                        <p>
                            Check out for more details in{' '}
                            <Anchor
                                target="_blank"
                                href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#http-path"
                                rel="noreferrer"
                            >
                                given documentation
                            </Anchor>
                            .
                        </p>
                    }
                    required
                    disabled={disabled}
                    placeholder="/sql/protocolv1/o/xxxx/xxxx"
                />

                <Group spacing="sm">
                    <Select
                        name="warehouse.authenticationType"
                        {...form.getInputProps('warehouse.authenticationType')}
                        defaultValue={defaultAuthType}
                        label="Authentication Type"
                        description={
                            isSsoEnabled &&
                            isLoadingAuth ? null : isAuthenticated ? (
                                <Text mt="0" color="gray" fs="xs">
                                    You are connected to Databricks,{' '}
                                    <Anchor
                                        href="#"
                                        onClick={() => {
                                            openLoginPopup();
                                        }}
                                    >
                                        Click here to reauthenticate.
                                    </Anchor>
                                </Text>
                            ) : (
                                'Choose how to authenticate with your data warehouse.'
                            )
                        }
                        data={authOptions}
                        required
                        disabled={disabled}
                        w={isAuthenticated ? '90%' : '100%'}
                    />
                    {isAuthenticated && (
                        <Tooltip label="You are connected to Databricks">
                            <Group mt="40px">
                                <MantineIcon icon={IconCheck} color="green" />
                            </Group>
                        </Tooltip>
                    )}
                </Group>

                {authenticationType ===
                DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN ? (
                    <PasswordInput
                        name="warehouse.personalAccessToken"
                        {...form.getInputProps('warehouse.personalAccessToken')}
                        label="Personal access token"
                        description={
                            <p>
                                Check out for more details in{' '}
                                <Anchor
                                    target="_blank"
                                    href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#personal-access-token"
                                    rel="noreferrer"
                                >
                                    given documentation
                                </Anchor>
                                .
                            </p>
                        }
                        required={requireSecrets}
                        placeholder={
                            disabled || !requireSecrets
                                ? '**************'
                                : undefined
                        }
                        disabled={disabled}
                    />
                ) : (
                    !isLoadingAuth && (
                        <DatabricksSSOInput
                            isAuthenticated={isAuthenticated}
                            disabled={disabled}
                            openLoginPopup={openLoginPopup}
                        />
                    )
                )}

                <TextInput
                    name="warehouse.catalog"
                    {...form.getInputProps('warehouse.catalog')}
                    label="Catalog name"
                    description="This is the catalog name."
                    required
                    disabled={disabled}
                />
                <FormSection isOpen={isOpen} name="advanced">
                    <Stack style={{ marginTop: '8px' }}>
                        <BooleanSwitch
                            name="warehouse.requireUserCredentials"
                            label="Require users to provide their own credentials"
                            defaultChecked={
                                DatabricksDefaultValues.requireUserCredentials
                            }
                            disabled={disabled}
                            {...form.getInputProps(
                                'warehouse.requireUserCredentials',
                                { type: 'checkbox' },
                            )}
                        />
                        <StartOfWeekSelect disabled={disabled} />
                        <Stack spacing="xs">
                            <Stack spacing={0}>
                                <Text fw={500}>Compute Resources</Text>
                                <Text c="dimmed" size="xs">
                                    Configure compute resources to use in your
                                    models
                                </Text>
                            </Stack>
                            <FormSection name="compute">
                                <Stack>
                                    {computes.map((field, index) => (
                                        <Group
                                            // @ts-expect-error
                                            key={field.key}
                                            noWrap
                                            spacing="xs"
                                        >
                                            <TextInput
                                                style={{
                                                    flexGrow: 1,
                                                }}
                                                size="xs"
                                                {...form.getInputProps(
                                                    `warehouse.compute.${index}.name`,
                                                )}
                                                placeholder="Compute Name"
                                                required
                                            />
                                            <TextInput
                                                style={{
                                                    flexGrow: 1,
                                                }}
                                                size="xs"
                                                {...form.getInputProps(
                                                    `warehouse.compute.${index}.httpPath`,
                                                )}
                                                placeholder="HTTP Path"
                                                required
                                            />
                                            <Tooltip label="Remove compute">
                                                <ActionIcon
                                                    size="sm"
                                                    onClick={() =>
                                                        removeCompute(index)
                                                    }
                                                    style={{
                                                        flexGrow: 0,
                                                    }}
                                                >
                                                    <MantineIcon
                                                        icon={IconTrash}
                                                    />
                                                </ActionIcon>
                                            </Tooltip>
                                        </Group>
                                    ))}
                                    <Button
                                        variant="default"
                                        size="xs"
                                        sx={(theme) => ({
                                            alignSelf: 'flex-end',
                                            boxShadow: theme.shadows.subtle,
                                        })}
                                        leftIcon={
                                            <MantineIcon icon={IconPlus} />
                                        }
                                        onClick={addCompute}
                                    >
                                        Add compute
                                    </Button>
                                </Stack>
                            </FormSection>
                        </Stack>
                    </Stack>
                </FormSection>
                <FormCollapseButton isSectionOpen={isOpen} onClick={toggleOpen}>
                    Advanced configuration options
                </FormCollapseButton>
            </Stack>
        </>
    );
};

export default DatabricksForm;
