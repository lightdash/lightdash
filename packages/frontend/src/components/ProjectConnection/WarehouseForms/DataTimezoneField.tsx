import {
    FeatureFlags,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import {
    Alert,
    Badge,
    Button,
    Card,
    Group,
    Stack,
    Text,
} from '@mantine-8/core';
import { type FC, type ReactNode } from 'react';
import { useDataTimezonePreviewMutation } from '../../../hooks/useProject';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import TimeZonePicker from '../../common/TimeZonePicker';
import { useFormContext } from '../formContext';
import { useProjectFormContext } from '../useProjectFormContext';

const PreviewRow: FC<{ label: string; value: ReactNode }> = ({
    label,
    value,
}) => (
    <Group justify="space-between" gap="md" wrap="nowrap">
        <Text size="xs" c="dimmed">
            {label}
        </Text>
        <Text size="xs" ff="monospace" ta="right">
            {value}
        </Text>
    </Group>
);

const DataTimezoneField: FC<{ disabled: boolean }> = ({ disabled }) => {
    const form = useFormContext();
    const { savedProject } = useProjectFormContext();
    const { data: timezoneSupportFlag } = useServerFeatureFlag(
        FeatureFlags.EnableTimezoneSupport,
    );
    const preview = useDataTimezonePreviewMutation();

    if (!(timezoneSupportFlag?.enabled ?? false)) return null;

    const onPreview = () => {
        const warehouse = form.values.warehouse;
        // The clearable TimeZonePicker yields null when unset, but the
        // credentials type validates dataTimezone as an optional string —
        // omit it so "no data timezone" previews as the UTC fallback.
        const credentials: CreateWarehouseCredentials = warehouse.dataTimezone
            ? warehouse
            : ({
                  ...warehouse,
                  dataTimezone: undefined,
              } as CreateWarehouseCredentials);
        preview.mutate({
            credentials,
            projectUuid: savedProject?.projectUuid,
        });
    };

    const result = preview.data;
    const snowflakeNotApplied =
        result &&
        !result.dataTimezoneApplies &&
        result.warehouseType === WarehouseTypes.SNOWFLAKE;

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

            {result && (
                <Stack gap="xs">
                    <Text size="xs" c="dimmed">
                        How the current moment flows through your settings —
                        data timezone <b>{result.selectedDataTimezone}</b>,
                        shown in project timezone{' '}
                        <b>{result.projectTimezone}</b>.
                    </Text>

                    {/* Affected: columns without a stored timezone */}
                    <Card withBorder padding="sm" radius="sm">
                        <Group justify="space-between" mb="xs" wrap="nowrap">
                            <Text size="xs" fw={600}>
                                Columns without a stored timezone
                            </Text>
                            <Badge
                                size="xs"
                                color={
                                    result.dataTimezoneApplies ? 'blue' : 'gray'
                                }
                                variant="light"
                            >
                                {result.dataTimezoneApplies
                                    ? 'affected'
                                    : 'not affected'}
                            </Badge>
                        </Group>
                        <Stack gap={4}>
                            <PreviewRow
                                label="From the warehouse"
                                value={`${result.naive.raw} (no timezone)`}
                            />
                            <PreviewRow
                                label={`Read as ${result.naive.interpretedAs}`}
                                value={result.naive.readAs}
                            />
                            <PreviewRow
                                label="Viewers see"
                                value={result.naive.rendered}
                            />
                        </Stack>
                        {snowflakeNotApplied && (
                            <Text size="xs" c="orange" mt="xs">
                                Snowflake stores timestamps in UTC, so your data
                                timezone isn't applied here.
                            </Text>
                        )}
                    </Card>

                    {/* Unaffected: columns that already carry a timezone */}
                    <Card withBorder padding="sm" radius="sm">
                        <Group justify="space-between" mb="xs" wrap="nowrap">
                            <Text size="xs" fw={600}>
                                Columns with a stored timezone
                            </Text>
                            <Badge size="xs" color="gray" variant="light">
                                not affected
                            </Badge>
                        </Group>
                        <Stack gap={4}>
                            <PreviewRow
                                label="From the warehouse"
                                value={result.aware.raw}
                            />
                            <PreviewRow
                                label="Data timezone ignored"
                                value="(already an exact moment)"
                            />
                            <PreviewRow
                                label="Viewers see"
                                value={result.aware.rendered}
                            />
                        </Stack>
                    </Card>

                    <Text size="xs" c="dimmed">
                        Tip: change the data timezone and preview again — only
                        the first group moves.
                    </Text>
                </Stack>
            )}
        </Stack>
    );
};

export default DataTimezoneField;
