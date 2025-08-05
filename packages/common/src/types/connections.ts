export enum ConnectionType {
    SHOPIFY = 'Shopify',
    GOOGLE_ANALYTICS = 'Google Analytics',
}

export interface Connection {
    connection_type: ConnectionType;
    user_uuid: string;
    name: string;
    is_connected: boolean;
    icon?: string; // Optional icon URL for the connection
}