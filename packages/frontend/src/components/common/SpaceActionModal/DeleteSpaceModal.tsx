import { FeatureFlags } from '@lightdash/common';
import { Group, Skeleton, Text, TextInput } from '@mantine/core';
import {
    IconAppWindow,
    IconChartBar,
    IconFolder,
    IconFileText,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { type DeleteSpaceModalBody } from '.';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useSpaceDeleteImpact } from '../../../hooks/useSpaces';
import useApp from '../../../providers/App/useApp';
import Callout from '../Callout';
import MantineIcon from '../MantineIcon';
import MantineModal from '../MantineModal';

const DeleteSpaceTextInputConfirmation: FC<{
    data: DeleteSpaceModalBody['data'];
    setCanDelete: (canDelete: boolean) => void;
}> = ({ data, setCanDelete }) => {
    const { t } = useTranslation('modals');
    const [value, setValue] = useState('');

    return (
        <TextInput
            label={t('deleteSpace.confirmNameLabel')}
            placeholder={t('deleteSpace.confirmNamePlaceholder')}
            value={value}
            onChange={(e) => {
                setValue(e.target.value);
                if (e.target.value === data?.name) {
                    setCanDelete(true);
                } else {
                    setCanDelete(false);
                }
            }}
        />
    );
};

const DeleteSpaceModalContent: FC<
    Pick<DeleteSpaceModalBody, 'data'> & { softDeleteEnabled: boolean }
> = ({ data, softDeleteEnabled }) => {
    const { t } = useTranslation('modals');
    const { data: impact, isLoading: isLoadingImpact } = useSpaceDeleteImpact(
        data?.projectUuid,
        data?.uuid,
    );
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const dataAppsEnabled = dataAppsFlag.data?.enabled ?? false;
    const documentsFlag = useServerFeatureFlag(FeatureFlags.Documents);
    const documentsEnabled =
        !documentsFlag.isError && documentsFlag.data?.enabled;

    if (isLoadingImpact) {
        return <Skeleton height={40} radius="sm" />;
    }

    if (!impact) {
        return null;
    }

    const descendantCount = impact.spaces.filter(
        (s) => s.uuid !== data?.uuid,
    ).length;

    const hasContent =
        descendantCount > 0 ||
        impact.chartCount > 0 ||
        impact.dashboardCount > 0 ||
        (documentsEnabled && impact.documentCount > 0) ||
        (dataAppsEnabled && impact.appCount > 0);

    if (!hasContent) {
        return null;
    }

    const title = softDeleteEnabled
        ? t('deleteSpace.impactSoft')
        : t('deleteSpace.impactPermanent');

    return (
        <Callout
            variant={softDeleteEnabled ? 'warning' : 'danger'}
            title={title}
        >
            <Group gap="lg">
                <Group gap={4}>
                    <MantineIcon
                        icon={IconFolder}
                        size="sm"
                        color={softDeleteEnabled ? 'yellow.7' : 'red.7'}
                        stroke={1.5}
                    />
                    <Text
                        size="sm"
                        fw={600}
                        c={softDeleteEnabled ? 'yellow.7' : 'red.7'}
                    >
                        {t('deleteSpace.counts.spaces', {
                            count: descendantCount,
                        })}
                    </Text>
                </Group>
                <Group gap={4}>
                    <MantineIcon
                        icon={IconChartBar}
                        size="sm"
                        color={softDeleteEnabled ? 'yellow.7' : 'red.7'}
                        stroke={1.5}
                    />
                    <Text
                        size="sm"
                        fw={600}
                        c={softDeleteEnabled ? 'yellow.7' : 'red.7'}
                    >
                        {t('deleteSpace.counts.charts', {
                            count: impact.chartCount,
                        })}
                    </Text>
                </Group>
                <Group gap={4}>
                    <MantineIcon
                        icon={IconLayoutDashboard}
                        size="sm"
                        color={softDeleteEnabled ? 'yellow.7' : 'red.7'}
                        stroke={1.5}
                    />
                    <Text
                        size="sm"
                        fw={600}
                        c={softDeleteEnabled ? 'yellow.7' : 'red.7'}
                    >
                        {t('deleteSpace.counts.dashboards', {
                            count: impact.dashboardCount,
                        })}
                    </Text>
                </Group>
                {dataAppsEnabled && (
                    <Group gap={4}>
                        <MantineIcon
                            icon={IconAppWindow}
                            size="sm"
                            color={softDeleteEnabled ? 'yellow.7' : 'red.7'}
                            stroke={1.5}
                        />
                        <Text
                            size="sm"
                            fw={600}
                            c={softDeleteEnabled ? 'yellow.7' : 'red.7'}
                        >
                            {t('deleteSpace.counts.dataApps', {
                                count: impact.appCount,
                            })}
                        </Text>
                    </Group>
                )}
                {documentsEnabled && (
                    <Group gap={4}>
                        <MantineIcon
                            icon={IconFileText}
                            size="sm"
                            color={softDeleteEnabled ? 'yellow.7' : 'red.7'}
                            stroke={1.5}
                        />
                        <Text
                            size="sm"
                            fw={600}
                            c={softDeleteEnabled ? 'yellow.7' : 'red.7'}
                        >
                            {t('deleteSpace.counts.documents', {
                                count: impact.documentCount,
                            })}
                        </Text>
                    </Group>
                )}
            </Group>
        </Callout>
    );
};

export const DeleteSpaceModal: FC<DeleteSpaceModalBody> = ({
    data,
    title,
    onClose,
    form,
    handleSubmit,
    isLoading,
}) => {
    const { health } = useApp();
    const softDeleteEnabled = health.data?.softDelete.enabled ?? false;
    const retentionDays = health.data?.softDelete.retentionDays ?? 30;

    const [canDelete, setCanDelete] = useState(false);
    const { t } = useTranslation('modals');

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={title}
            variant="delete"
            size="lg"
            onConfirm={form.onSubmit(handleSubmit)}
            confirmDisabled={!canDelete || isLoading}
            confirmLoading={isLoading}
            cancelDisabled={isLoading}
        >
            <Text fz="sm">
                <Trans
                    t={t}
                    i18nKey="deleteSpace.confirm"
                    values={{ name: data?.name }}
                    components={{
                        name: softDeleteEnabled ? (
                            <Text span fw={600} fz="sm" />
                        ) : (
                            <Text span fw={600} />
                        ),
                    }}
                />
            </Text>
            <DeleteSpaceModalContent
                data={data}
                softDeleteEnabled={softDeleteEnabled}
            />
            {softDeleteEnabled && (
                <Text fz="sm">
                    {t('deleteSpace.softDeleteRetention', {
                        count: retentionDays,
                    })}
                </Text>
            )}
            <DeleteSpaceTextInputConfirmation
                data={data}
                setCanDelete={setCanDelete}
            />
        </MantineModal>
    );
};
