import { Button } from '@mantine/core';
import { type FC } from 'react';
import ErrorState from '../../../components/common/ErrorState';
import { GSheetsIcon } from '../../../components/common/GSheetsIcon';
import MantineModal, {
    type MantineModalProps,
} from '../../../components/common/MantineModal';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useSyncModalForm } from '../hooks/useSyncModalForm';
import { SyncModalAction } from '../providers/types';
import { useSyncModal } from '../providers/useSyncModal';
import { type SyncResource } from '../types';
import { SyncModalForm } from './SyncModalForm';
import { SyncModalFormProvider } from './syncModalFormContext';

type Props = {
    resource: SyncResource;
} & Pick<MantineModalProps, 'opened' | 'onClose'>;

export const SyncModalCreateOrEdit: FC<Props> = ({
    resource,
    opened,
    onClose,
}) => {
    const { setAction } = useSyncModal();
    const {
        form,
        handleSubmit,
        isLoading,
        isEditing,
        isLoadingSchedulerData,
        isSchedulerError,
        schedulerError,
    } = useSyncModalForm(resource);

    const hasSetGoogleSheet = form.values.options.gdriveId !== '';

    if (isEditing && isLoadingSchedulerData) {
        return <SuboptimalState title="Loading Sync" loading />;
    }

    if (isEditing && isSchedulerError && schedulerError) {
        return <ErrorState error={schedulerError.error} />;
    }

    const formId = 'api-sync-form';

    return (
        <SyncModalFormProvider form={form}>
            <MantineModal
                opened={opened}
                onClose={onClose}
                title="Sync with Google Sheets"
                icon={GSheetsIcon}
                size="xl"
                onCancel={() => setAction(SyncModalAction.VIEW)}
                modalBodyProps={{
                    bg: 'background',
                }}
                actions={
                    <Button
                        form={formId}
                        type="submit"
                        disabled={!hasSetGoogleSheet || !form.isValid()}
                        loading={isLoading}
                    >
                        {isEditing ? 'Save changes' : 'Create'}
                    </Button>
                }
            >
                <SyncModalForm
                    id={formId}
                    onSubmit={handleSubmit}
                    isApp={resource.type === 'app'}
                />
            </MantineModal>
        </SyncModalFormProvider>
    );
};
