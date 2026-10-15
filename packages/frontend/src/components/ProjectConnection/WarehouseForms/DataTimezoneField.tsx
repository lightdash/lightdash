import {
    FeatureFlags,
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
} from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
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
        <Badge size="sm" circle>
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
    const { t } = useTranslation('projectConnection');
    const form = useFormContext();
    const { savedProject } = useProjectFormContext();
    const { data: timezoneSupportFlag } = useServerFeatureFlag(
        FeatureFlags.EnableTimezoneSupport,
    );
    const preview = useDataTimezonePreviewMutation();

    if (!(timezoneSupportFlag?.enabled ?? false)) return null;

    const onPreview = () => {
        const warehouse = form.values.warehouse;
        // Edit flow: the stored secrets stay on the server, so send only the
        // project, the current warehouse type, and the data timezone being
        // tried (null when the clearable picker is empty).
        if (savedProject) {
            preview.mutate({
                mode: 'edit',
                projectUuid: savedProject.projectUuid,
                warehouseType: warehouse.type,
                dataTimezone: warehouse.dataTimezone ?? null,
            });
            return;
        }
        // Create flow: send the just-typed credentials. The picker yields null
        // when cleared; omit it so the unset case previews as the warehouse
        // default rather than failing validation.
        const credentials: CreateWarehouseCredentials = warehouse.dataTimezone
            ? warehouse
            : {
                  ...warehouse,
                  dataTimezone: undefined,
              };
        preview.mutate({ mode: 'create', credentials });
    };

    const result = preview.data;

    return (
        <Stack gap="xs">
            <TimeZonePicker
                size="sm"
                maw="100%"
                label={t('dataTimezone.label')}
                description={t('dataTimezone.description')}
                searchable
                clearable
                placeholder={t('dataTimezone.placeholder')}
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
                {t('dataTimezone.preview')}
            </Button>

            {preview.isError && (
                <Alert color="red" title={t('dataTimezone.previewFailed')}>
                    {preview.error?.error.message ??
                        t('dataTimezone.connectionFailed')}
                </Alert>
            )}

            {result && (
                <Stack gap="xs">
                    <Text size="xs" c="dimmed">
                        {t('dataTimezone.stepByStep')}
                    </Text>
                    {!result.dataTimezoneApplies && (
                        <Text size="xs" c="dimmed">
                            {t('dataTimezone.noTimezone')}
                        </Text>
                    )}
                    <PipelineStep
                        n={1}
                        title={t('dataTimezone.fromWarehouse')}
                        value={t('dataTimezone.rawValue', {
                            raw: result.naive.raw,
                        })}
                    />
                    <Connector>
                        {result.dataTimezoneApplies
                            ? t('dataTimezone.readAsDataTimezone', {
                                  timezone: result.naive.interpretedAs,
                              })
                            : t('dataTimezone.readAs', {
                                  timezone: result.naive.interpretedAs,
                              })}
                    </Connector>
                    <PipelineStep
                        n={2}
                        title={t('dataTimezone.exactMoment')}
                        value={result.naive.readAs}
                    />
                    <Connector>
                        {t('dataTimezone.shownIn', {
                            timezone: result.projectTimezone,
                        })}
                    </Connector>
                    <PipelineStep
                        n={3}
                        title={t('dataTimezone.whatUsersSee')}
                        value={result.naive.rendered}
                    />
                    <Divider my={4} />
                    <Text size="xs" c="dimmed">
                        <Trans
                            t={t}
                            i18nKey="dataTimezone.awareNote"
                            values={{
                                raw: result.aware.raw,
                                rendered: result.aware.rendered,
                            }}
                            components={{ mono: <Text span ff="monospace" /> }}
                        />
                    </Text>
                </Stack>
            )}
        </Stack>
    );
};

export default DataTimezoneField;
