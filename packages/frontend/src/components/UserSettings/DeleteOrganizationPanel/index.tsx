import { Button, Group } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { FC, useState } from 'react';
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
        <Group position="right">
            <Button
                variant="outline"
                color="red"
                leftIcon={<MantineIcon icon={IconTrash} />}
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
