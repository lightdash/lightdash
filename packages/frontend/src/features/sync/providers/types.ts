export enum SyncModalAction {
    CREATE = 'create',
    EDIT = 'edit',
    VIEW = 'view',
    DELETE = 'delete',
}

export interface SyncFormConfig {
    /** Whether the submit button should be disabled */
    disabled: boolean;
    /** Whether an operation is in progress */
    loading: boolean;
    /** Text for the confirm/submit button */
    confirmText: string;
}

export const SYNC_FORM_ID = 'sync-form';
