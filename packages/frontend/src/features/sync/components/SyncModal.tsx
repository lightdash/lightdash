import { Flex, Modal, Title, type ModalProps } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { GSheetsIcon } from '../../../components/common/GSheetsIcon';
import MantineIcon from '../../../components/common/MantineIcon';
import { getSchedulerUuidFromUrlParams } from '../../../features/scheduler/utils';
import {
    SyncModalAction,
    SyncModalProvider,
    useSyncModal,
} from '../providers/SyncModalProvider';
import { SyncModalDelete } from './SyncModalDelete';
import { SyncModalForm } from './SyncModalForm';
import { SyncModalView } from './SyncModalView';

type Props = { chartUuid: string } & Pick<ModalProps, 'opened' | 'onClose'>;

const SyncModalBaseAndManager: FC<Props> = ({ chartUuid, opened, onClose }) => {
    const { search, pathname } = useLocation();
    const history = useHistory();
    const { action, setAction, setCurrentSchedulerUuid } = useSyncModal();

    useEffect(() => {
        const schedulerUuidFromParams = getSchedulerUuidFromUrlParams(search);

        if (schedulerUuidFromParams) {
            setAction(SyncModalAction.EDIT);
            setCurrentSchedulerUuid(schedulerUuidFromParams);
            history.replace({ pathname });
        }
    }, [history, pathname, search, setAction, setCurrentSchedulerUuid]);

    let modalTitle = 'Sync with Google Sheets';
    let headerIcon: typeof GSheetsIcon | typeof IconTrash = GSheetsIcon;
    let headerIconColor = 'black';

    if (action === SyncModalAction.CREATE) {
        modalTitle = 'Create a new Sync';
    } else if (action === SyncModalAction.EDIT) {
        modalTitle = 'Edit Sync';
    } else if (action === SyncModalAction.DELETE) {
        headerIcon = IconTrash;
        modalTitle = 'Delete Sync';
        headerIconColor = 'red';
    }

    return (
        <Modal
            size="xl"
            opened={opened}
            title={
                <Flex align="center" gap="xs">
                    <MantineIcon icon={headerIcon} color={headerIconColor} />
                    <Title order={5}>{modalTitle}</Title>
                </Flex>
            }
            onClose={onClose}
        >
            {action === SyncModalAction.VIEW && (
                <SyncModalView chartUuid={chartUuid} />
            )}
            {(action === SyncModalAction.CREATE ||
                action === SyncModalAction.EDIT) && (
                <SyncModalForm chartUuid={chartUuid} />
            )}
            {action === SyncModalAction.DELETE && <SyncModalDelete />}
        </Modal>
    );
};

export const SyncModal: FC<Props> = ({ chartUuid, opened, onClose }) => (
    <SyncModalProvider>
        <SyncModalBaseAndManager
            chartUuid={chartUuid}
            opened={opened}
            onClose={onClose}
        />
    </SyncModalProvider>
);
