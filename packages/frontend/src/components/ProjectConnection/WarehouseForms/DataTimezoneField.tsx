import {
    FeatureFlags,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import {
    Alert,
    Badge,
    Button,
    Divider,
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

const PipelineStep: FC<{ n: number; title: string; value: ReactNode }> = ({
    n,
    title,
    value,
}) => (
    <Group gap="sm" wrap="nowrap" align="flex-start">
        <Badge size="sm" circle variant="light">
            {n}
        </Badge>
        <Stack gap={0}>
            <Text size="xs" fw={600}>
                {title}
            </Text>
            <Text size="xs" ff="monospace">
                {value}
            </Text>
        </Stack>
    </Group>
);

const Connector: FC<{ children: ReactNode }> = ({ children }) => (
    <Text size="xs" c="dimmed" ml="md" pl={4}>
        ↓ {children}
    </Text>
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
        // credentials type validates dataTimezone as an optional string,
        // so omit it so "no data timezone" previews as the UTC fallback.
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
    const snowflakeNotApplied = Boolean(
        result &&
        !result.dataTimezoneApplies &&
        result.warehouseType === WarehouseTypes.SNOWFLAKE,
    );

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
                        The current moment, step by step
                    </Text>
                    <PipelineStep
                        n={1}
                        title="From the warehouse"
                        value={`${result.naive.raw}  ·  no timezone`}
                    />
                    <Connector>
                        read as {result.naive.interpretedAs} (your data
                        timezone)
                        {snowflakeNotApplied &&
                            ', but Snowflake stores UTC, so it is not applied'}
                    </Connector>
                    <PipelineStep
                        n={2}
                        title="An exact moment in time"
                        value={result.naive.readAs}
                    />
                    <Connector>
                        shown in {result.projectTimezone} (your project
                        timezone)
                    </Connector>
                    <PipelineStep
                        n={3}
                        title="What viewers see"
                        value={result.naive.rendered}
                    />
                    <Divider my={4} />
                    <Text size="xs" c="dimmed">
                        If a column already stores a timezone, step 1 is
                        skipped: the moment is already exact and your data
                        timezone is ignored. Viewers see{' '}
                        <Text span ff="monospace">
                            {result.aware.rendered}
                        </Text>
                        .
                    </Text>
                </Stack>
            )}
        </Stack>
    );
};

export default DataTimezoneField;
