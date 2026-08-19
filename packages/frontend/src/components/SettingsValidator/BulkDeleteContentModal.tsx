import { ContentType } from '@lightdash/common';
import { List, ScrollArea, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { type FC } from 'react';
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
        chartCount > 0 && `${chartCount} chart${chartCount === 1 ? '' : 's'}`,
        dashboardCount > 0 &&
            `${dashboardCount} dashboard${dashboardCount === 1 ? '' : 's'}`,
    ].filter(Boolean);

    return (
        <MantineModal
            size="lg"
            title="Delete broken content"
            icon={IconTrash}
            opened={opened}
            onClose={onClose}
            variant="delete"
            confirmLabel={`Delete ${items.length} item${
                items.length === 1 ? '' : 's'
            }`}
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
                title={`This will delete ${summaryParts.join(' and ')} from this project.`}
            >
                {isSoftDeleteEnabled ? (
                    <Text fz="xs">
                        Deleted content can be restored from recently deleted.
                    </Text>
                ) : (
                    <Text fz="xs">This cannot be undone.</Text>
                )}
            </Callout>
            <ScrollArea.Autosize mah={300} scrollbars="y">
                <List size="xs">
                    {items.map((item) => (
                        <List.Item key={`${item.contentType}-${item.uuid}`}>
                            {item.name}
                            <Text span c="dimmed" fz="xs">
                                {' '}
                                ({item.contentType}, {item.views} view
                                {item.views === 1 ? '' : 's'})
                            </Text>
                        </List.Item>
                    ))}
                </List>
            </ScrollArea.Autosize>
        </MantineModal>
    );
};
