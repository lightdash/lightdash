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
import { Trans, useTranslation } from 'react-i18next';
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

const SwitchPlanSummary: FC<{ plan: WarehouseConnectionSwitchPlan }> = ({
    plan,
}) => {
    const { t } = useTranslation('projectConnection');
    const { staysOnOriginal } = plan;
    const warehouse = getWarehouseLabel(plan.connection.warehouseType);
    return (
        <Stack gap="sm">
            <Text size="sm">
                <Trans
                    t={t}
                    i18nKey={
                        plan.connection.database
                            ? 'multipleConnections.summary.addsWithDatabase'
                            : 'multipleConnections.summary.adds'
                    }
                    values={{
                        name: plan.connection.name,
                        warehouse,
                        database: plan.connection.database,
                    }}
                    components={{ name: <Text span fw={600} /> }}
                />
            </Text>
            <Text size="sm">
                <Trans
                    t={t}
                    i18nKey="multipleConnections.summary.currentBecomes"
                    values={{ name: plan.original.name }}
                    components={{ name: <Text span fw={600} /> }}
                />
            </Text>
            <List size="sm" spacing={2}>
                <List.Item>
                    {t('multipleConnections.summary.explores', {
                        count: staysOnOriginal.explores,
                    })}
                </List.Item>
                <List.Item>
                    {t('multipleConnections.summary.sqlChartsWithVersions', {
                        charts: t('multipleConnections.summary.sqlCharts', {
                            count: staysOnOriginal.sqlCharts,
                        }),
                        versions: t('multipleConnections.summary.versions', {
                            count: staysOnOriginal.sqlChartVersions,
                        }),
                    })}
                </List.Item>
                <List.Item>
                    {t('multipleConnections.summary.dbtSources', {
                        count: staysOnOriginal.dbtSources,
                    })}
                </List.Item>
                <List.Item>
                    {t('multipleConnections.summary.scheduledDeliveries', {
                        count: staysOnOriginal.scheduledDeliveries,
                    })}
                </List.Item>
                <List.Item>
                    {t('multipleConnections.summary.dashboards', {
                        count: staysOnOriginal.dashboards,
                    })}
                </List.Item>
            </List>
            {plan.personalCredentials.requireUserCredentials && (
                <Text size="sm">
                    {t('multipleConnections.summary.personalCredentials', {
                        count: plan.personalCredentials
                            .usersWithPersonalCredentials,
                        original: plan.original.name,
                        connection: plan.connection.name,
                    })}
                </Text>
            )}
            <Text size="sm">
                {t('multipleConnections.summary.afterSwitch', {
                    original: plan.original.name,
                })}
            </Text>
            <Alert
                color="orange"
                icon={<MantineIcon icon={IconAlertTriangle} />}
            >
                {t('multipleConnections.summary.noWayBack')}
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
    const { t } = useTranslation('projectConnection');
    const [originalName, setOriginalName] = useState(
        () =>
            getWarehouseLabel(warehouseType) ??
            t('multipleConnections.defaultOriginalName'),
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
                title={t('multipleConnections.enable')}
                size="lg"
                confirmLabel={t('multipleConnections.enable')}
                onConfirm={() =>
                    switchMutation.mutate({
                        ...previewed.request,
                        planHash: previewed.plan.planHash,
                        idempotencyKey: previewed.idempotencyKey,
                    })
                }
                confirmLoading={switchMutation.isLoading}
                cancelLabel={t('actions.back', { ns: 'common' })}
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
            title={t('multipleConnections.enable')}
            size="lg"
            confirmLabel={t('multipleConnections.review')}
            onConfirm={handlePreview}
            confirmLoading={previewMutation.isLoading}
            cancelDisabled={previewMutation.isLoading}
        >
            <Stack gap="md">
                <TextInput
                    label={t('multipleConnections.originalNameLabel')}
                    description={t(
                        'multipleConnections.originalNameDescription',
                    )}
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
                    primaryRequiresUserCredentials={
                        primaryRequiresUserCredentials
                    }
                    showName
                    intro={t('multipleConnections.intro')}
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

export const EnableMultipleConnectionsCard: FC<{
    projectUuid: string;
    primaryRequiresUserCredentials: boolean;
}> = ({ projectUuid, primaryRequiresUserCredentials }) => {
    const { t } = useTranslation('projectConnection');
    const { data } = useWarehouseConnectionSwitchAvailability(
        projectUuid,
        true,
    );
    const [isOpen, setIsOpen] = useState(false);

    if (!data) return null;

    return (
        <Card padding="lg">
            <Stack gap="md">
                <Title order={5}>{t('connectionsPanel.title')}</Title>
                <Text size="sm" c="dimmed">
                    {t('multipleConnections.cardDescription')}
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
                                {t('multipleConnections.enable')}
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
