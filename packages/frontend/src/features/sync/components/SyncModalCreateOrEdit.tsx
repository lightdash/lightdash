import { subject } from '@casl/ability';
import { Button, Tabs } from '@mantine/core';
import { type FC } from 'react';
import ErrorState from '../../../components/common/ErrorState';
import { GSheetsIcon } from '../../../components/common/GSheetsIcon';
import MantineModal, {
    type MantineModalProps,
} from '../../../components/common/MantineModal';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import useApp from '../../../providers/App/useApp';
import { useSyncModalForm } from '../hooks/useSyncModalForm';
import { SyncModalAction } from '../providers/types';
import { useSyncModal } from '../providers/useSyncModal';
import { type SyncResource } from '../types';
import { SyncChartFilterOverrides } from './SyncChartFilterOverrides';
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
    const { user } = useApp();
    const {
        form,
        handleSubmit,
        isLoading,
        isEditing,
        isLoadingSchedulerData,
        savedFilters,
        filtersWithUnmetRequirements,
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

    const chart = resource.type === 'chart' ? resource.chart : undefined;
    const canAdjustFilters =
        !!chart &&
        !!user.data?.ability.can(
            'manage',
            subject('Explore', {
                organizationUuid: chart.organizationUuid,
                projectUuid: chart.projectUuid,
            }),
        );
    const formId = 'api-sync-form';
    const setup = (
        <SyncModalForm
            id={formId}
            onSubmit={handleSubmit}
            isApp={resource.type === 'app'}
            supportsFilters={resource.type !== 'sqlChart'}
        />
    );

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
                {chart ? (
                    <Tabs defaultValue="setup">
                        <Tabs.List aria-label="Sync settings">
                            <Tabs.Tab value="setup">Setup</Tabs.Tab>
                            <Tabs.Tab value="filters">Filters</Tabs.Tab>
                        </Tabs.List>
                        <Tabs.Panel value="setup" pt="md">
                            {setup}
                        </Tabs.Panel>
                        <Tabs.Panel value="filters" pt="md">
                            <SyncChartFilterOverrides
                                chart={chart}
                                canAdjustFilters={canAdjustFilters}
                                savedFilters={savedFilters}
                                isEditing={isEditing}
                                filtersWithUnmetRequirements={
                                    filtersWithUnmetRequirements
                                }
                            />
                        </Tabs.Panel>
                    </Tabs>
                ) : (
                    setup
                )}
            </MantineModal>
        </SyncModalFormProvider>
    );
};
