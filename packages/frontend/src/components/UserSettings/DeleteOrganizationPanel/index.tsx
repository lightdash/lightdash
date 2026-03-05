import { Button, Group } from '@mantine-8/core';
import { IconTrash } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import MantineIcon from '../../common/MantineIcon';
import { OrganizationDeleteModal } from './DeleteOrganizationModal';

export const DeleteOrganizationPanel: FC = () => {
    const { isInitialLoading: isOrganizationLoading, data: organization } =
        useOrganization();

    const [showDeleteOrganizationModal, setShowDeleteOrganizationModal] =
        useState(false);

    if (isOrganizationLoading || organization === undefined) return null;

    return (
        <Group justify="flex-end">
            <Button
                variant="outline"
                color="red"
                leftSection={<MantineIcon icon={IconTrash} />}
                onClick={() => setShowDeleteOrganizationModal(true)}
            >
                Delete '{organization.name}'
            </Button>

            <OrganizationDeleteModal
                opened={showDeleteOrganizationModal}
                onClose={() => setShowDeleteOrganizationModal(false)}
            />
        </Group>
    );
};
