import { type CredentialSlot } from '@lightdash/common';
import { type Knex } from 'knex';

export const CredentialBindingsTableName = 'credential_bindings';

export type DbCredentialBindings = {
    credential_binding_uuid: string;
    project_uuid: string;
    warehouse_connection_uuid: string | null;
    slot: CredentialSlot;
    user_uuid: string | null;
    credential_uuid: string;
    created_at: Date;
    created_by_user_uuid: string | null;
};

export type DbCredentialBindingsInsert = Pick<
    DbCredentialBindings,
    'project_uuid' | 'slot' | 'credential_uuid'
> &
    Partial<DbCredentialBindings>;

export type CredentialBindingsTable = Knex.CompositeTableType<
    DbCredentialBindings,
    DbCredentialBindingsInsert,
    Knex.MaybeRawRecord<Partial<DbCredentialBindingsInsert>>
>;
