import {
    validateWarehouseConnectionName,
    WAREHOUSE_CONNECTION_NAME_MAX_LENGTH,
    type ApiWarehouseConnectionSwitchRequest,
    type CreateWarehouseCredentials,
    type WarehouseConnectionSwitchPlan,
    type WarehouseTypes,
} from '@lightdash/common';
import {
    Alert,
    Box,
    Button,
    Card,
    Group,
    List,
    Stack,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconAlertTriangle, IconPlus } from '@tabler/icons-react';
import { useState, type FC } from 'react';
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

type PreviewedSwitch = {
    plan: WarehouseConnectionSwitchPlan;
    request: ApiWarehouseConnectionSwitchRequest;
    idempotencyKey: string;
};

const pluralise = (count: number, singular: string, plural: string) =>
    `${count} ${count === 1 ? singular : plural}`;

const SwitchPlanSummary: FC<{ plan: WarehouseConnectionSwitchPlan }> = ({
    plan,
}) => {
    const { staysOnOriginal } = plan;
    return (
        <Stack gap="sm">
            <Text size="sm">
                The switch adds{' '}
                <Text span fw={600}>
                    {plan.connection.name}
                </Text>{' '}
                ({getWarehouseLabel(plan.connection.warehouseType)}
                {plan.connection.database
                    ? `, database ${plan.connection.database}`
                    : ''}
                ). Its connection test passed.
            </Text>
            <Text size="sm">
                The current connection becomes{' '}
                <Text span fw={600}>
                    {plan.original.name}
                </Text>
                . Everything that exists today stays on it:
            </Text>
            <List size="sm" spacing={2}>
                <List.Item>
                    {pluralise(staysOnOriginal.explores, 'explore', 'explores')}
                </List.Item>
                <List.Item>
                    {pluralise(
                        staysOnOriginal.sqlCharts,
                        'SQL chart',
                        'SQL charts',
                    )}{' '}
                    (
                    {pluralise(
                        staysOnOriginal.sqlChartVersions,
                        'version',
                        'versions',
                    )}
                    )
                </List.Item>
                <List.Item>
                    {pluralise(
                        staysOnOriginal.dbtSources,
                        'dbt source',
                        'dbt sources',
                    )}
                </List.Item>
                <List.Item>
                    {pluralise(
                        staysOnOriginal.scheduledDeliveries,
                        'scheduled delivery',
                        'scheduled deliveries',
                    )}
                </List.Item>
                <List.Item>
                    {pluralise(
                        staysOnOriginal.dashboards,
                        'dashboard',
                        'dashboards',
                    )}
                </List.Item>
            </List>
            {plan.personalCredentials.requireUserCredentials && (
                <Text size="sm">
                    This project requires personal credentials.{' '}
                    {pluralise(
                        plan.personalCredentials.usersWithPersonalCredentials,
                        'person',
                        'people',
                    )}{' '}
                    with personal credentials keep them for {plan.original.name}
                    , and choose one for {plan.connection.name} when they first
                    use it.
                </Text>
            )}
            <Text size="sm">
                After the switch, the SQL runner shows a connection picker and
                these settings list the connections. A CLI deploy without a
                source keeps using {plan.original.name}.
            </Text>
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
    onClose: () => void;
}> = ({ projectUuid, warehouseType, onClose }) => {
    const [originalName, setOriginalName] = useState(
        () => getWarehouseLabel(warehouseType) ?? 'Original',
    );
    const [previewed, setPreviewed] = useState<PreviewedSwitch | null>(null);
    const form = useForm({
        initialValues: {
            name: '',
            warehouse: {
                ...warehouseDefaultValues[warehouseType],
            } as CreateWarehouseCredentials,
            ...unusedDbtFormValues,
        },
        validate: {
            name: validateWarehouseConnectionName,
            warehouse: warehouseValueValidators[warehouseType],
        },
        validateInputOnBlur: true,
    });
    const previewMutation = usePreviewWarehouseConnectionSwitch(projectUuid);
    const switchMutation = useSwitchToMultipleConnections(projectUuid, {
        onSuccess: onClose,
    });
    const originalNameError = validateWarehouseConnectionName(originalName);

    const handlePreview = () => {
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
        previewMutation.mutate(request, {
            onSuccess: (plan) =>
                setPreviewed({
                    plan,
                    request,
                    idempotencyKey: crypto.randomUUID(),
                }),
        });
    };

    if (previewed) {
        return (
            <MantineModal
                opened
                onClose={onClose}
                title="Enable multiple connections"
                size="lg"
                confirmLabel="Enable multiple connections"
                onConfirm={() =>
                    switchMutation.mutate({
                        ...previewed.request,
                        planHash: previewed.plan.planHash,
                        idempotencyKey: previewed.idempotencyKey,
                    })
                }
                confirmLoading={switchMutation.isLoading}
                cancelLabel="Back"
                cancelDisabled={switchMutation.isLoading}
                onCancel={() => setPreviewed(null)}
            >
                <SwitchPlanSummary plan={previewed.plan} />
            </MantineModal>
        );
    }

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Enable multiple connections"
            size="lg"
            confirmLabel="Review the switch"
            onConfirm={handlePreview}
            confirmLoading={previewMutation.isLoading}
            cancelDisabled={previewMutation.isLoading}
        >
            <Stack gap="md">
                <TextInput
                    label="Name of the current connection"
                    description="Everything that exists today keeps using this connection."
                    required
                    maxLength={WAREHOUSE_CONNECTION_NAME_MAX_LENGTH}
                    value={originalName}
                    error={originalNameError}
                    onChange={(event) =>
                        setOriginalName(event.currentTarget.value)
                    }
                />
                <ConnectionFields
                    form={form}
                    projectUuid={projectUuid}
                    warehouseType={warehouseType}
                    showName
                    intro="Add the first extra connection. It uses the same warehouse type, and it is tested before the preview."
                />
                {previewMutation.error && (
                    <Text size="sm" c="red">
                        {previewMutation.error.error.message}
                    </Text>
                )}
            </Stack>
        </MantineModal>
    );
};

export const EnableMultipleConnectionsCard: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { data } = useWarehouseConnectionSwitchAvailability(
        projectUuid,
        true,
    );
    const [isOpen, setIsOpen] = useState(false);

    if (!data) return null;

    return (
        <Card padding="lg">
            <Stack gap="md">
                <Title order={5}>Connections</Title>
                <Text size="sm" c="dimmed">
                    This project uses one warehouse connection. Add more
                    connections of the same warehouse type to query several
                    warehouses from this project. Everything that exists today
                    keeps using the current connection.
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
                    onClose={() => setIsOpen(false)}
                />
            )}
        </Card>
    );
};
