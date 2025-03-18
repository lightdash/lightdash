import { WarehouseTypes } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    Group,
    PasswordInput,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import { useToggle } from 'react-use';
import { v4 as uuidv4 } from 'uuid';
import MantineIcon from '../../common/MantineIcon';
import FormCollapseButton from '../FormCollapseButton';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { useFormContext } from '../formContext';
import { useProjectFormContext } from '../useProjectFormContext';

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

const DatabricksForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const form = useFormContext();
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.DATABRICKS;

    if (form.values.warehouse?.type !== WarehouseTypes.DATABRICKS) {
        throw new Error(
            'Databricks form is not available for this warehouse type',
        );
    }

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
                <TextInput
                    name="warehouse.catalog"
                    {...form.getInputProps('warehouse.catalog')}
                    label="Catalog name"
                    description="This is the catalog name."
                    required
                    disabled={disabled}
                />
                <FormSection isOpen={isOpen} name="advanced">
                    <Stack>
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
                                            <Tooltip
                                                variant="xs"
                                                label="Remove compute"
                                            >
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
