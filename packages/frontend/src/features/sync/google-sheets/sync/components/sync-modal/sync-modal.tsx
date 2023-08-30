import { Flex, Modal, Title } from '@mantine/core';
import { FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { GsheetsIcon } from '../../../../../../components/SchedulerModals/SchedulerModalBase/SchedulerModalBase.styles';
import {
    SyncWithGoogleSheetsModalAction,
    useSyncWithGoogleSheetsModal,
} from '../../hooks/use-sync-with-google-sheets-modal-provider';
import { SyncModalForm } from './sync-modal-form';
import { SyncModalView } from './sync-modal-view';

export const SyncModal: FC<{ chartUuid: string }> = ({ chartUuid }) => {
    const { action } = useSyncWithGoogleSheetsModal();

    let modalTitle = 'Sync with Google Sheets';

    if (action === SyncWithGoogleSheetsModalAction.CREATE) {
        modalTitle = 'Create a new Sync';
    } else if (action === SyncWithGoogleSheetsModalAction.EDIT) {
        modalTitle = 'Edit Sync';
    }

    return (
        <Modal
            size="md"
            opened
            title={
                <Flex align="center" gap="xs">
                    <MantineIcon icon={GsheetsIcon} />
                    <Title order={5}>{modalTitle}</Title>
                </Flex>
            }
            onClose={() => {}}
        >
            {action === SyncWithGoogleSheetsModalAction.VIEW && (
                <SyncModalView chartUuid={chartUuid} />
            )}
            {(action === SyncWithGoogleSheetsModalAction.CREATE ||
                action === SyncWithGoogleSheetsModalAction.EDIT) && (
                // TODO: add edit action
                <SyncModalForm chartUuid={chartUuid} />
            )}
        </Modal>
    );
};
