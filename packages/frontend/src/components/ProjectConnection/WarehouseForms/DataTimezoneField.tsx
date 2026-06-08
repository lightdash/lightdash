import { FeatureFlags, WarehouseTypes } from '@lightdash/common';
import { Alert, Button, Stack, Table, Text } from '@mantine-8/core';
import { type FC } from 'react';
import { useDataTimezonePreviewMutation } from '../../../hooks/useProject';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import TimeZonePicker from '../../common/TimeZonePicker';
import { useFormContext } from '../formContext';
import { useProjectFormContext } from '../useProjectFormContext';

const DataTimezoneField: FC<{ disabled: boolean }> = ({ disabled }) => {
    const form = useFormContext();
    const { savedProject } = useProjectFormContext();
    const { data: timezoneSupportFlag } = useServerFeatureFlag(
        FeatureFlags.EnableTimezoneSupport,
    );
    const preview = useDataTimezonePreviewMutation();

    if (!(timezoneSupportFlag?.enabled ?? false)) return null;

    const onPreview = () => {
        preview.mutate({
            credentials: form.values.warehouse,
            projectUuid: savedProject?.projectUuid,
        });
    };

    return (
        <Stack gap="xs">
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
            <Button
                variant="default"
                size="xs"
                onClick={onPreview}
                loading={preview.isLoading}
                disabled={disabled}
            >
                Preview
            </Button>
            {preview.isError && (
                <Alert color="red" title="Could not preview">
                    {preview.error?.error.message ?? 'Connection failed'}
                </Alert>
            )}
            {preview.data && (
                <Stack gap={4}>
                    <Text size="xs" c="dimmed">
                        Raw warehouse value: {preview.data.raw}
                    </Text>
                    <Table withTableBorder fz="xs">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Interpreted as</Table.Th>
                                <Table.Th>
                                    Rendered in {preview.data.projectTimezone}
                                </Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            <Table.Tr>
                                <Table.Td>
                                    {preview.data.effective.interpretedAs}
                                </Table.Td>
                                <Table.Td>
                                    {preview.data.effective.rendered}
                                </Table.Td>
                            </Table.Tr>
                            <Table.Tr>
                                <Table.Td>UTC (baseline)</Table.Td>
                                <Table.Td>
                                    {preview.data.utcBaseline.rendered}
                                </Table.Td>
                            </Table.Tr>
                        </Table.Tbody>
                    </Table>
                    {preview.data.effectiveSourceTimezone !==
                        preview.data.selectedDataTimezone && (
                        <Text size="xs" c="orange">
                            {preview.data.warehouseType ===
                            WarehouseTypes.SNOWFLAKE
                                ? 'Snowflake stores timestamps as UTC; the data timezone is not applied here.'
                                : 'The effective source timezone differs from the selected value.'}
                        </Text>
                    )}
                </Stack>
            )}
        </Stack>
    );
};

export default DataTimezoneField;
