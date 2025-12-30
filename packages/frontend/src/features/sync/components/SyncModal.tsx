import { Anchor, Button, Popover, Text } from '@mantine-8/core';
import { IconInfoCircle, IconTrash } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { GSheetsIcon } from '../../../components/common/GSheetsIcon';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal, {
    type MantineModalProps,
} from '../../../components/common/MantineModal';
import { getSchedulerUuidFromUrlParams } from '../../../features/scheduler/utils';
import { SyncModalProvider } from '../providers/SyncModalProvider';
import { SYNC_FORM_ID, SyncModalAction } from '../providers/types';
import { useSyncModal } from '../providers/useSyncModal';
import { SyncModalDelete } from './SyncModalDelete';
import { SyncModalForm } from './SyncModalForm';
import { SyncModalView } from './SyncModalView';

type Props = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    chartUuid: string;
};

const GoogleApiPolicyButton = () => (
    <Popover withinPortal width={300} withArrow>
        <Popover.Target>
            <Button
                size="xs"
                variant="subtle"
                color="gray"
                leftSection={<MantineIcon size={12} icon={IconInfoCircle} />}
            >
                Google API Services User Data Policy
            </Button>
        </Popover.Target>

        <Popover.Dropdown>
            <Text fz={9}>
                Lightdash's use and transfer of information received from Google
                APIs adhere to{' '}
                <Anchor
                    target="_blank"
                    fz={9}
                    href="https://developers.google.com/terms/api-services-user-data-policy"
                >
                    Google API Services User Data Policy
                </Anchor>
                , including the Limited Use requirements.
            </Text>
        </Popover.Dropdown>
    </Popover>
);

const SyncModalBaseAndManager: FC<Props> = ({ chartUuid, opened, onClose }) => {
    const { search, pathname } = useLocation();
    const navigate = useNavigate();
    const {
        action,
        setAction,
        setCurrentSchedulerUuid,
        formConfig,
        isDeleting,
    } = useSyncModal();

    useEffect(() => {
        const schedulerUuidFromParams = getSchedulerUuidFromUrlParams(search);

        if (schedulerUuidFromParams) {
            setAction(SyncModalAction.EDIT);
            setCurrentSchedulerUuid(schedulerUuidFromParams);
            void navigate({ pathname }, { replace: true });
        }
    }, [navigate, pathname, search, setAction, setCurrentSchedulerUuid]);

    let modalTitle = 'Sync with Google Sheets';
    let headerIcon: typeof GSheetsIcon | typeof IconTrash = GSheetsIcon;

    if (action === SyncModalAction.CREATE) {
        modalTitle = 'Create a new Sync';
    } else if (action === SyncModalAction.EDIT) {
        modalTitle = 'Edit Sync';
    } else if (action === SyncModalAction.DELETE) {
        headerIcon = IconTrash;
        modalTitle = 'Delete Sync';
    }

    // Render right-side actions based on state
    const renderActions = () => {
        if (action === SyncModalAction.VIEW) {
            return (
                <Button onClick={() => setAction(SyncModalAction.CREATE)}>
                    Create New Sync
                </Button>
            );
        }

        if (action === SyncModalAction.DELETE) {
            return (
                <Button
                    color="red"
                    loading={isDeleting}
                    form={SYNC_FORM_ID}
                    type="submit"
                >
                    Delete
                </Button>
            );
        }

        if (
            (action === SyncModalAction.CREATE ||
                action === SyncModalAction.EDIT) &&
            formConfig
        ) {
            return (
                <Button
                    type="submit"
                    form={SYNC_FORM_ID}
                    disabled={formConfig.disabled}
                    loading={formConfig.loading}
                >
                    {formConfig.confirmText}
                </Button>
            );
        }

        return null;
    };

    // Render left-side actions based on state
    const renderLeftActions = () => {
        if (action === SyncModalAction.VIEW) {
            return <GoogleApiPolicyButton />;
        }
    };

    return (
        <MantineModal
            size="xl"
            opened={opened}
            onClose={onClose}
            title={modalTitle}
            icon={headerIcon}
            actions={renderActions()}
            leftActions={renderLeftActions()}
            modalBodyProps={{ px: 0, py: 0 }}
        >
            {action === SyncModalAction.VIEW && (
                <SyncModalView chartUuid={chartUuid} />
            )}
            {(action === SyncModalAction.CREATE ||
                action === SyncModalAction.EDIT) && (
                <SyncModalForm chartUuid={chartUuid} />
            )}
            {action === SyncModalAction.DELETE && <SyncModalDelete />}
        </MantineModal>
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
