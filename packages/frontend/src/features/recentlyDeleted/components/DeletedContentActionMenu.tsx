import { type DeletedContentWithDescendants } from '@lightdash/common';
import { ActionIcon, Menu } from '@mantine/core';
import { IconDotsVertical, IconRestore, IconTrash } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';

interface Props {
    item: DeletedContentWithDescendants;
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
            <Menu position="bottom-end" withArrow>
                <Menu.Target>
                    <ActionIcon
                        loading={isLoading}
                        data-tour-anchor="deleted-content-actions"
                        data-tour-hint="Open actions for {value}"
                        data-tour-value={item.name}
                    >
                        <MantineIcon icon={IconDotsVertical} />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconRestore} />}
                        onClick={onRestore}
                        data-tour-scope="manage:DeletedContent"
                        data-tour-step="2"
                        data-tour-route="/projects/:projectUuid/recently-deleted"
                        data-tour-label="Restore the chart"
                        data-tour-title="Restore a deleted chart"
                        data-tour-docs="explore/version-history.mdx#recently-deleted-charts-and-dashboards:li1"
                        data-tour-interactive="true"
                        data-tour-via='[data-tour-nav="browse"] >> [data-tour-nav="all-charts"] >> [data-tour-anchor="chart-row"][data-tour-value="Orders over time"] >> [data-tour-anchor="chart-actions"] >> [data-tour-anchor="delete-chart"] >> [data-tour-anchor="modal-confirm"] >> [data-tour-nav="browse"] >> [data-tour-nav="recently-deleted"] >> [data-tour-anchor="deleted-content-actions"][data-tour-value="Orders over time"]'
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
