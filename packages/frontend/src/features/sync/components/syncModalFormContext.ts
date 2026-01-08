import { createFormContext } from '@mantine/form';

export interface SyncModalFormValues {
    name: string;
    cron: string;
    timezone: string | undefined;
    options: {
        gdriveId: string;
        gdriveName: string;
        gdriveOrganizationName: string;
        url: string;
        tabName: string;
    };
    saveInNewTab: boolean;
}

const [SyncModalFormProvider, useSyncModalFormContext, useSyncModalForm] =
    createFormContext<SyncModalFormValues>();

export { SyncModalFormProvider, useSyncModalForm, useSyncModalFormContext };

export const DEFAULT_VALUES: SyncModalFormValues = {
    name: '',
    cron: '0 9 * * *',
    timezone: undefined,
    options: {
        gdriveId: '',
        gdriveName: '',
        gdriveOrganizationName: '',
        url: '',
        tabName: '',
    },
    saveInNewTab: false,
};
