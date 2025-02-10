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
import { useFieldArray, useFormContext } from 'react-hook-form';
import { useToggle } from 'react-use';
import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import FormSection from '../../ReactHookForm/FormSection';
import MantineIcon from '../../common/MantineIcon';
import FormCollapseButton from '../FormCollapseButton';
import { useProjectFormContext } from '../useProjectFormContext';
import StartOfWeekSelect from './Inputs/StartOfWeekSelect';

export const DatabricksSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { register } = useFormContext();

    return (
        <TextInput
            // this supposed to be a `schema` but changing it will break for existing customers

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
            {...register('warehouse.database', {
                validate: {
                    hasNoWhiteSpaces: hasNoWhiteSpaces('Schema'),
                },
            })}
            disabled={disabled}
        />
    );
};

const DatabricksForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.DATABRICKS;
    const { register, control } = useFormContext();
    const {
        fields: computeFields,
        append,
        remove,
    } = useFieldArray({
        control,
        name: 'warehouse.compute',
    });

    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
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
                    {...register('warehouse.serverHostName', {
                        validate: {
                            hasNoWhiteSpaces:
                                hasNoWhiteSpaces('Server host name'),
                        },
                    })}
                    disabled={disabled}
                    placeholder="xxxx.gcp.databricks.com"
                    labelProps={{ style: { marginTop: '8px' } }}
                />
                <TextInput
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
                    {...register('warehouse.httpPath', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('HTTP Path'),
                        },
                    })}
                    disabled={disabled}
                    placeholder="/sql/protocolv1/o/xxxx/xxxx"
                />
                <PasswordInput
                    {...register('warehouse.personalAccessToken')}
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
                    label="Catalog name"
                    description="This is the catalog name."
                    required
                    {...register('warehouse.catalog', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('Catalog name'),
                        },
                    })}
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
                                    {computeFields.map((field, index) => (
                                        <Group
                                            key={field.id}
                                            noWrap
                                            spacing="xs"
                                        >
                                            <TextInput
                                                style={{
                                                    flexGrow: 1,
                                                }}
                                                size="xs"
                                                {...register(
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
                                                {...register(
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
                                                        remove(index)
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
                                        onClick={() =>
                                            append({
                                                name: '',
                                                httpPath: '',
                                            })
                                        }
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
