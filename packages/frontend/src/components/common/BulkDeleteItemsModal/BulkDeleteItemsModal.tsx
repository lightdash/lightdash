import { type ResourceViewItem } from '@lightdash/common';
import { Alert, Button, Group, LoadingOverlay, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../MantineIcon';
import MantineModal, { type MantineModalProps } from '../MantineModal';

type Props<T> = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    items: T;
    isLoading: boolean;
    onConfirm: () => void;
};

const ItemName = ({ name }: { name: string }) => {
    return (
        <Text fw={600} component="span">
            "{name}"
        </Text>
    );
};

const getItemsText = <T extends ResourceViewItem>(items: T[]) => {
    if (items.length === 1) {
        return {
            name: <ItemName name={items[0].data.name} />,
            type: items[0].type,
        };
    }

    return {
        name: `${items.length} items`,
        type: 'items',
    };
};

const BulkDeleteItemsModal = <R extends ResourceViewItem, T extends Array<R>>({
    opened,
    onClose,
    items,
    onConfirm,
    isLoading,
}: Props<T>) => {
    const itemsText = useMemo(() => getItemsText(items), [items]);

    const itemsList = useMemo(() => {
        if (items.length <= 5) {
            return items.map((item) => item.data.name);
        }
        return [
            ...items.slice(0, 5).map((item) => item.data.name),
            `and ${items.length - 5} more...`,
        ];
    }, [items]);

    if (items.length === 0) return null;

    return (
        <MantineModal
            title={`Delete ${itemsText.type}`}
            opened={opened}
            onClose={onClose}
            size="lg"
        >
            <LoadingOverlay visible={isLoading} />

            <Alert
                color="red"
                icon={<MantineIcon icon={IconAlertTriangle} />}
                mb="md"
            >
                <Text fw={500}>This action cannot be undone</Text>
            </Alert>

            <Text mb="md">Are you sure you want to delete {itemsText.name}?</Text>

            {items.length > 1 && (
                <Alert color="gray" mb="md">
                    <Text size="sm" fw={500} mb="xs">
                        Items to be deleted:
                    </Text>
                    {itemsList.map((name, idx) => (
                        <Text key={idx} size="sm">
                            • {name}
                        </Text>
                    ))}
                </Alert>
            )}

            <Group position="right" mt="lg">
                <Button variant="default" onClick={onClose} disabled={isLoading}>
                    Cancel
                </Button>
                <Button color="red" onClick={onConfirm} loading={isLoading}>
                    Delete
                </Button>
            </Group>
        </MantineModal>
    );
};

export default BulkDeleteItemsModal;
