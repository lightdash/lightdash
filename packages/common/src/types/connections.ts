export enum ConnectionType {
    SHOPIFY = 'shopify',
    GOOGLE_ANALYTICS = 'ga',
}

export interface Connection {
    connectionUuid: string;
    type: ConnectionType;
    userUuid: string | null;
    propertyId?: string | null; // e.g., for Google Analytics
    shopUrl?: string | null; // e.g., for Shopify
}