import { type DeletedContentSummary } from '@lightdash/common';
import { ActionIcon, Menu } from '@mantine-8/core';
import { IconDotsVertical, IconRestore, IconTrash } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';

interface Props {
    item: DeletedContentSummary;
    onRestore: () => void;
    onPermanentlyDelete: () => void;
    isLoading?: boolean;
}

const DeletedContentActionMenu: FC<Props> = ({
    item,
    onRestore,
    onPermanentlyDelete,
    isLoading,
}) => {
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    return (
        <>
            <Menu position="bottom-end" withArrow withinPortal shadow="md">
                <Menu.Target>
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        loading={isLoading}
                    >
                        <MantineIcon icon={IconDotsVertical} />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconRestore} />}
                        onClick={onRestore}
                    >
                        Restore
                    </Menu.Item>
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconTrash} />}
                        color="red"
                        onClick={() => setIsDeleteModalOpen(true)}
                    >
                        Delete permanently
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>

            <MantineModal
                opened={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                title="Permanently delete item?"
                variant="delete"
                resourceType="item"
                resourceLabel={item.name}
                onConfirm={() => {
                    onPermanentlyDelete();
                    setIsDeleteModalOpen(false);
                }}
                confirmLabel="Delete permanently"
            />
        </>
    );
};

export default DeletedContentActionMenu;
