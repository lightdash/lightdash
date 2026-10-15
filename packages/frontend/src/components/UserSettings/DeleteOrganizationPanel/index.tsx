import { Button, Group } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import MantineIcon from '../../common/MantineIcon';
import { OrganizationDeleteModal } from './DeleteOrganizationModal';

export const DeleteOrganizationPanel: FC = () => {
    const { t } = useTranslation('userSettings');
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
                {t('deleteOrganizationPanel.deleteButton', {
                    name:
                        organization.name.trim() ||
                        t('deleteOrganizationPanel.unnamedOrganization'),
                })}
            </Button>

            <OrganizationDeleteModal
                opened={showDeleteOrganizationModal}
                onClose={() => setShowDeleteOrganizationModal(false)}
            />
        </Group>
    );
};
