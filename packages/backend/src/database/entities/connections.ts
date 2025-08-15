import { ConnectionType } from '@lightdash/common';
import { Knex } from 'knex';

export type DbConnection = {
    connection_id: number;
    connection_uuid: string;
    type: ConnectionType; // e.g., 'shopify', 'stripe', etc.
    user_uuid: string | null; // foreign key to users table
    
    property_id: string | null; // e.g., for Google Analytics
    shop_url: string | null; // e.g., for Shopify
    
    is_active: boolean;
    expires_at: Date | null;
    created_at: Date;
    updated_at: Date;
    access_token: string;
    refresh_token: string | null;
};


// Insert shape: omit identity + timestamps; allow passing a pre-generated UUID if desired
export type CreateConnection = Omit<
    DbConnection,
    'connection_id' | 'connection_uuid' | 'created_at' | 'updated_at'
> & { connection_uuid?: string };

// Update shape: fields you reasonably allow to change
export type UpdateConnection = Partial<
    Pick<
        DbConnection,
        | 'type'
        | 'user_uuid'
        | 'access_token'
        | 'refresh_token'
        | 'expires_at'
        | 'is_active'
    >
>;

export type ConnectionsTable = Knex.CompositeTableType<
    DbConnection,
    CreateConnection,
    UpdateConnection
>;

export const ConnectionsTableName = "connections";
