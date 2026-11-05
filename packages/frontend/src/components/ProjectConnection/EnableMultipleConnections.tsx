import {
    FeatureFlags,
    supportsMultipleConnections,
    validateWarehouseConnectionName,
    WAREHOUSE_CONNECTION_NAME_MAX_LENGTH,
    type ApiError,
    type ApiWarehouseConnectionSwitchRequest,
    type CreateWarehouseCredentials,
    type WarehouseTypes,
} from '@lightdash/common';
import {
    Alert,
    Box,
    Button,
    Card,
    Fieldset,
    Group,
    List,
    Loader,
    Stack,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconAlertTriangle, IconPlus } from '@tabler/icons-react';
import { useRef, useState, type FC } from 'react';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import {
    usePreviewWarehouseConnectionSwitch,
    useSwitchToMultipleConnections,
    useWarehouseConnectionSwitchAvailability,
} from '../../hooks/useWarehouseConnectionSwitch';
import MantineIcon from '../common/MantineIcon';
import MantineModal from '../common/MantineModal';
import { ConnectionFields } from './ConnectionFields';
import { unusedDbtFormValues } from './connectionFormDefaults';
import { useForm } from './formContext';
import { getWarehouseLabel } from './ProjectConnectFlow/utils';
import { warehouseDefaultValues } from './WarehouseForms/defaultValues';
import { warehouseValueValidators } from './WarehouseForms/validators';

type SubmitStep = 'idle' | 'testing' | 'enabling';

const SUBMIT_STATUS: Record<Exclude<SubmitStep, 'idle'>, string> = {
    testing: 'Testing connection…',
    enabling: 'Enabling multiple connections…',
};

const errorMessage = (error: unknown): string =>
    (error as Partial<ApiError> | undefined)?.error?.message ??
    'Something went wrong. Try again.';

const WhatHappens: FC<{
    originalName: string;
    primaryRequiresUserCredentials: boolean;
}> = ({ originalName, primaryRequiresUserCredentials }) => {
    const current = originalName.trim() || 'the current connection';
    return (
        <Stack gap="sm">
            <Text size="sm" fw={600}>
                When you enable multiple connections
            </Text>
            <List size="sm" spacing={4}>
                <List.Item>
                    The new connection is tested first. Nothing changes if the
                    test fails.
                </List.Item>
                <List.Item>
                    Everything that exists today keeps using{' '}
                    <Text span fw={600} inherit>
                        {current}
                    </Text>
                    .
                </List.Item>
                <List.Item>
                    The SQL runner shows a connection picker. A CLI deploy
                    without a source keeps using {current}.
                </List.Item>
                {primaryRequiresUserCredentials && (
                    <List.Item>
                        People with personal credentials keep them for {current}
                        , and choose one for the new connection when they first
                        use it.
                    </List.Item>
                )}
            </List>
            <Alert
                color="orange"
                icon={<MantineIcon icon={IconAlertTriangle} />}
            >
                There is no way back to a single connection. You can remove an
                extra connection when nothing uses it.
            </Alert>
        </Stack>
    );
};

const EnableMultipleConnectionsModal: FC<{
    projectUuid: string;
    warehouseType: WarehouseTypes;
    primaryRequiresUserCredentials: boolean;
    onClose: () => void;
}> = ({
    projectUuid,
    warehouseType,
    primaryRequiresUserCredentials,
    onClose,
}) => {
    const mixedWarehouseFlag = useServerFeatureFlag(
        FeatureFlags.MixedWarehouseConnections,
    );
    const mixedTypesEnabled = mixedWarehouseFlag.data?.enabled === true;
    const [originalName, setOriginalName] = useState(
        () => getWarehouseLabel(warehouseType) ?? 'Original',
    );
    const [step, setStep] = useState<SubmitStep>('idle');
    const [submitError, setSubmitError] = useState<string | null>(null);
    const submittingRef = useRef(false);
    // One key per distinct request, so a retry of the same request can be
    // recognised by the server if an earlier attempt already went through.
    const idempotencyKeys = useRef(new Map<string, string>());
    const form = useForm({
        initialValues: {
            name: '',
            warehouse: {
                ...warehouseDefaultValues[warehouseType],
            } as CreateWarehouseCredentials,
            ...unusedDbtFormValues,
        },
        validate: (values) => {
            const errors: Record<string, string> = {};
            const nameError = validateWarehouseConnectionName(
                values.name ?? '',
            );
            if (nameError) errors.name = nameError;
            Object.entries(
                warehouseValueValidators[values.warehouse.type],
            ).forEach(([field, validator]) => {
                const error = validator(
                    Reflect.get(values.warehouse, field),
                    values,
                );
                if (error) errors[`warehouse.${field}`] = error;
            });
            return errors;
        },
        validateInputOnBlur: true,
        onValuesChange: () => setSubmitError(null),
    });
    const previewMutation = usePreviewWarehouseConnectionSwitch(projectUuid);
    const switchMutation = useSwitchToMultipleConnections(projectUuid, {
        onSuccess: onClose,
    });
    const originalNameError = validateWarehouseConnectionName(originalName);
    const isSubmitting = step !== 'idle';

    const handleEnable = async () => {
        if (submittingRef.current) return;
        if (form.validate().hasErrors || originalNameError) return;
        const request: ApiWarehouseConnectionSwitchRequest = {
            original: {
                name: originalName.trim(),
                listAllDatabases: false,
                additionalDatabases: [],
            },
            connection: {
                name: form.values.name.trim(),
                warehouseConnection: form.values.warehouse,
            },
        };
        const requestKey = JSON.stringify(request);
        const idempotencyKey =
            idempotencyKeys.current.get(requestKey) ?? crypto.randomUUID();
        idempotencyKeys.current.set(requestKey, idempotencyKey);

        submittingRef.current = true;
        setSubmitError(null);
        try {
            setStep('testing');
            const plan = await previewMutation.mutateAsync(request);
            setStep('enabling');
            await switchMutation.mutateAsync({
                ...request,
                planHash: plan.planHash,
                idempotencyKey,
            });
        } catch (error) {
            setSubmitError(errorMessage(error));
        } finally {
            submittingRef.current = false;
            setStep('idle');
        }
    };

    return (
        <MantineModal
            opened
            onClose={() => {
                if (!submittingRef.current) onClose();
            }}
            title="Enable multiple connections"
            size="lg"
            confirmLabel="Enable multiple connections"
            onConfirm={() => void handleEnable()}
            confirmLoading={isSubmitting}
            cancelLabel="Cancel"
            cancelDisabled={isSubmitting}
        >
            <Stack gap="md">
                <Fieldset
                    variant="unstyled"
                    disabled={isSubmitting}
                    aria-label="Connection details"
                >
                    <Stack gap="md">
                        <TextInput
                            label="Name of the current connection"
                            description="Everything that exists today keeps using this connection."
                            required
                            maxLength={WAREHOUSE_CONNECTION_NAME_MAX_LENGTH}
                            value={originalName}
                            error={originalNameError}
                            onChange={(event) => {
                                setOriginalName(event.currentTarget.value);
                                setSubmitError(null);
                            }}
                        />
                        <ConnectionFields
                            form={form}
                            projectUuid={projectUuid}
                            warehouseType={warehouseType}
                            primaryRequiresUserCredentials={
                                primaryRequiresUserCredentials
                            }
                            showName
                            allowMixedWarehouseTypes={mixedTypesEnabled}
                            intro={
                                mixedTypesEnabled
                                    ? 'Add the first extra connection. It is tested when you enable multiple connections.'
                                    : 'Add the first extra connection. It uses the same warehouse type, and it is tested when you enable multiple connections.'
                            }
                        />
                    </Stack>
                </Fieldset>
                <WhatHappens
                    originalName={originalName}
                    primaryRequiresUserCredentials={
                        primaryRequiresUserCredentials
                    }
                />
                {step !== 'idle' && (
                    <Group gap="xs" role="status">
                        <Loader size="xs" />
                        <Text size="sm">{SUBMIT_STATUS[step]}</Text>
                    </Group>
                )}
                {submitError && (
                    <Text size="sm" c="red">
                        {submitError}
                    </Text>
                )}
            </Stack>
        </MantineModal>
    );
};

export const EnableMultipleConnectionsCard: FC<{
    projectUuid: string;
    primaryRequiresUserCredentials: boolean;
}> = ({ projectUuid, primaryRequiresUserCredentials }) => {
    const { data } = useWarehouseConnectionSwitchAvailability(
        projectUuid,
        true,
    );
    const [isOpen, setIsOpen] = useState(false);
    const mixedWarehouseFlag = useServerFeatureFlag(
        FeatureFlags.MixedWarehouseConnections,
    );
    const supportsExtras = supportsMultipleConnections(
        data?.originalWarehouseType ?? null,
        mixedWarehouseFlag.data?.enabled === true,
    );

    if (!data) return null;

    return (
        <Card padding="lg">
            <Stack gap="md">
                <Title order={5}>Connections</Title>
                <Text size="sm" c="dimmed">
                    This project uses one warehouse connection.{' '}
                    {mixedWarehouseFlag.data?.enabled === true
                        ? 'Add connections of any warehouse type to query several warehouses from this project.'
                        : 'Add more connections of the same warehouse type to query several warehouses from this project.'}{' '}
                    Everything that exists today keeps using the current
                    connection.
                </Text>
                <Group justify="flex-end">
                    <Tooltip
                        w={300}
                        disabled={data.canSwitch || !data.reason}
                        label={data.reason}
                    >
                        <Box>
                            <Button
                                variant="default"
                                leftSection={<MantineIcon icon={IconPlus} />}
                                disabled={
                                    !data.canSwitch ||
                                    !supportsExtras ||
                                    !data.originalWarehouseType
                                }
                                onClick={() => setIsOpen(true)}
                            >
                                Enable multiple connections
                            </Button>
                        </Box>
                    </Tooltip>
                </Group>
            </Stack>
            {isOpen && data.originalWarehouseType && (
                <EnableMultipleConnectionsModal
                    projectUuid={projectUuid}
                    warehouseType={data.originalWarehouseType}
                    primaryRequiresUserCredentials={
                        primaryRequiresUserCredentials
                    }
                    onClose={() => setIsOpen(false)}
                />
            )}
        </Card>
    );
};
