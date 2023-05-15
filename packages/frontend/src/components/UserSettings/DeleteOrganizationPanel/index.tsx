import { Button, Group } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { FC, useState } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import MantineIcon from '../../common/MantineIcon';
import OrganizationDeleteModal from '../../common/modal/OrganizationDeleteModal';

export const DeleteOrganizationPanel: FC = () => {
    const { isLoading: isLoading, data: organization } = useOrganization();

    const [showConfirmation, setShowConfirmation] = useState<boolean>(false);

    if (isLoading || organization === undefined) return null;

    return (
        <Group position="right">
            <Button
                variant="outline"
                color="red"
                leftIcon={<MantineIcon icon={IconTrash} />}
                onClick={() => setShowConfirmation(true)}
            >
                Delete '{organization.name}'
            </Button>

            <OrganizationDeleteModal
                isOpen={showConfirmation}
                onClose={() => setShowConfirmation(false)}
                onConfirm={() => setShowConfirmation(false)}
            />
        </Group>
    );
};
