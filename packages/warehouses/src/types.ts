export {
    WarehouseCatalog,
    WarehouseClient,
    WarehouseExecuteAsyncQuery,
    WarehouseExecuteAsyncQueryArgs,
    WarehouseTableSchema,
} from '@lightdash/common';

/**
 * Instance-level options passed to warehouse clients at construction.
 * Gated behind feature flags resolved by the backend (see FeatureFlags).
 */
export type WarehouseClientOptions = {
    /** Map warehouse ARRAY columns to ARRAY dimensions instead of STRING. */
    enableArrayDimensions?: boolean;
};
