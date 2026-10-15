import { TextInput, type ModalProps } from '@mantine/core';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useDeleteOrganizationMutation } from '../../../hooks/organization/useOrganizationDeleteMultation';
import MantineModal from '../../common/MantineModal';

export const OrganizationDeleteModal: FC<
    Pick<ModalProps, 'opened' | 'onClose'>
> = ({ opened, onClose }) => {
    const { t } = useTranslation('userSettings');
    const { isInitialLoading, data: organization } = useOrganization();
    const { mutateAsync, isLoading: isDeleting } =
        useDeleteOrganizationMutation();

    const [confirmOrgName, setConfirmOrgName] = useState('');

    if (isInitialLoading || !organization) return null;

    const organizationName = organization.name.trim();
    const confirmationText = organizationName || 'DELETE';

    const handleConfirm = async () => {
        await mutateAsync(organization.organizationUuid);
        onClose();
    };

    const handleOnClose = () => {
        setConfirmOrgName('');
        onClose();
    };

    return (
        <MantineModal
            opened={opened}
            onClose={handleOnClose}
            title={t('deleteOrganizationPanel.modal.title', {
                name:
                    organizationName ||
                    t('deleteOrganizationPanel.unnamedOrganization'),
            })}
            variant="delete"
            confirmLabel={t('deleteOrganizationPanel.modal.confirmLabel')}
            description={t('deleteOrganizationPanel.modal.description')}
            size="md"
            onConfirm={handleConfirm}
            confirmDisabled={
                confirmOrgName.toLowerCase() !== confirmationText.toLowerCase()
            }
            confirmLoading={isDeleting}
        >
            <TextInput
                name="confirmOrgName"
                label={t('deleteOrganizationPanel.modal.typeToConfirm', {
                    text: confirmationText,
                })}
                description={
                    organizationName
                        ? undefined
                        : t('deleteOrganizationPanel.modal.noNameHint', {
                              text: confirmationText,
                          })
                }
                placeholder={confirmationText}
                value={confirmOrgName}
                onChange={(e) => setConfirmOrgName(e.target.value)}
            />
        </MantineModal>
    );
};
