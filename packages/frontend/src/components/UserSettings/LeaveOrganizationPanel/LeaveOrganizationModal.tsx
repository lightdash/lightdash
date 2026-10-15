import { Stack, Text, TextInput, type ModalProps } from '@mantine/core';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useLeaveOrganizationMutation } from '../../../hooks/user/useLeaveOrganizationMutation';
import MantineModal from '../../common/MantineModal';

export const LeaveOrganizationModal: FC<
    Pick<ModalProps, 'opened' | 'onClose'>
> = ({ opened, onClose }) => {
    const { t } = useTranslation('userSettings');
    const { isInitialLoading, data: organization } = useOrganization();
    const { mutateAsync, isLoading: isLeaving } =
        useLeaveOrganizationMutation();

    const [confirmOrgName, setConfirmOrgName] = useState('');

    if (isInitialLoading || !organization) return null;

    const organizationName = organization.name.trim();
    const confirmationText = organizationName || 'LEAVE';

    const handleConfirm = async () => {
        await mutateAsync();
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
            title={t('leaveOrganizationPanel.modal.title', {
                name:
                    organizationName ||
                    t('leaveOrganizationPanel.unnamedOrganization'),
            })}
            variant="delete"
            confirmLabel={t('leaveOrganizationPanel.modal.confirmLabel')}
            size="md"
            onConfirm={handleConfirm}
            confirmDisabled={
                confirmOrgName.toLowerCase() !== confirmationText.toLowerCase()
            }
            confirmLoading={isLeaving}
        >
            <Stack gap="sm">
                <Text fz="sm" c="dimmed">
                    {t('leaveOrganizationPanel.modal.description')}
                </Text>

                <TextInput
                    name="confirmOrgName"
                    label={t('leaveOrganizationPanel.modal.typeToConfirm', {
                        text: confirmationText,
                    })}
                    placeholder={confirmationText}
                    value={confirmOrgName}
                    onChange={(e) => setConfirmOrgName(e.target.value)}
                />
            </Stack>
        </MantineModal>
    );
};
