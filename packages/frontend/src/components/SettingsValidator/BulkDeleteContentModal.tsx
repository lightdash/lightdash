import { ContentType } from '@lightdash/common';
import { List, ScrollArea, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useContentBulkAction } from '../../hooks/useContent';
import useApp from '../../providers/App/useApp';
import Callout from '../common/Callout';
import MantineModal from '../common/MantineModal';
import {
    toBulkDeletePayload,
    type ValidationContentItem,
} from './utils/deletableContent';

type Props = {
    projectUuid: string;
    items: ValidationContentItem[];
    opened: boolean;
    onClose: () => void;
    onDeleted?: () => void;
};

export const BulkDeleteContentModal: FC<Props> = ({
    projectUuid,
    items,
    opened,
    onClose,
    onDeleted,
}) => {
    const { t } = useTranslation('projectSettings');
    const { health } = useApp();
    const isSoftDeleteEnabled = health.data?.softDelete.enabled ?? false;
    const queryClient = useQueryClient();

    const { mutate: contentBulkAction, isLoading } = useContentBulkAction(
        projectUuid,
        {
            onSuccess: async () => {
                await queryClient.invalidateQueries(['validation']);
                await queryClient.invalidateQueries(['paginatedValidation']);
                await queryClient.invalidateQueries(['validationSummary']);
                onDeleted?.();
                onClose();
            },
        },
    );

    const chartCount = items.filter(
        (item) => item.contentType === ContentType.CHART,
    ).length;
    const dashboardCount = items.length - chartCount;

    const summaryParts = [
        chartCount > 0 && t('validator.counts.charts', { count: chartCount }),
        dashboardCount > 0 &&
            t('validator.counts.dashboards', { count: dashboardCount }),
    ].filter(Boolean);

    return (
        <MantineModal
            size="lg"
            title={t('validator.bulkDelete.title')}
            icon={IconTrash}
            opened={opened}
            onClose={onClose}
            variant="delete"
            confirmLabel={t('validator.bulkDelete.confirm', {
                count: items.length,
            })}
            confirmLoading={isLoading}
            confirmDisabled={items.length === 0}
            onConfirm={() =>
                contentBulkAction({
                    content: toBulkDeletePayload(items),
                    action: { type: 'delete' },
                })
            }
        >
            <Callout
                variant="warning"
                title={t('validator.bulkDelete.warning', {
                    content: summaryParts.join(t('validator.andSeparator')),
                })}
            >
                {isSoftDeleteEnabled ? (
                    <Text fz="xs">
                        {t('validator.bulkDelete.softDeleteNote')}
                    </Text>
                ) : (
                    <Text fz="xs">{t('validator.bulkDelete.cannotUndo')}</Text>
                )}
            </Callout>
            <ScrollArea.Autosize mah={300} scrollbars="y">
                <List size="xs">
                    {items.map((item) => (
                        <List.Item key={`${item.contentType}-${item.uuid}`}>
                            {item.name}
                            <Text span c="dimmed" fz="xs">
                                {' '}
                                {t('validator.bulkDelete.itemMeta', {
                                    contentType: item.contentType,
                                    views: t('validator.counts.views', {
                                        count: item.views,
                                    }),
                                })}
                            </Text>
                        </List.Item>
                    ))}
                </List>
            </ScrollArea.Autosize>
        </MantineModal>
    );
};
