/**
 * Queries a data app declares for scheduled delivery, as received from the
 * sandboxed iframe SDK.
 *
 * Keep in sync with `DeliveryQuery` in packages/query-sdk/src/delivery.ts. The
 * frontend and backend cannot import the SDK — deployment images don't include
 * it — so this is the copy they read, mirroring the SDK_FEATURES arrangement.
 */

/** Declarations beyond this are rejected: a delivery with more tabs than this
 *  is a runaway app, not a report. */
export const MAX_DELIVERY_QUERIES = 50;

export type DeliveryQuery =
    | {
          kind: 'query';
          label: string | null;
          // Deliberately loose: duplicating the SDK's full QueryDefinition here
          // would create a second shape to keep in sync for no gain. Validation
          // only needs enough to reject garbage; the delivery packaging does the
          // real conversion, against the same body the bridge already POSTs to
          // /query/metric-query.
          query: Record<string, unknown> & { exploreName: string };
      }
    | {
          kind: 'savedChart';
          label: string | null;
          chartUuid: string;
          limit?: number;
          parameters?: Record<string, unknown>;
          filters?: unknown[];
      };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isLabel = (value: unknown): value is string | null =>
    value === null || typeof value === 'string';

const isDeliveryQuery = (value: unknown): value is DeliveryQuery => {
    if (!isPlainObject(value) || !isLabel(value.label)) return false;
    if (value.kind === 'query') {
        return (
            isPlainObject(value.query) &&
            typeof value.query.exploreName === 'string' &&
            value.query.exploreName.length > 0
        );
    }
    if (value.kind === 'savedChart') {
        return (
            typeof value.chartUuid === 'string' && value.chartUuid.length > 0
        );
    }
    return false;
};

/**
 * Validate an untrusted delivery-queries payload.
 * Returns null for anything that isn't a non-empty array of valid
 * declarations within the cap — callers warn on null rather than treating it
 * as "declared nothing", which is a different (and normal) state.
 */
export const parseDeliveryQueries = (
    value: unknown,
): DeliveryQuery[] | null => {
    if (!Array.isArray(value)) return null;
    if (value.length === 0 || value.length > MAX_DELIVERY_QUERIES) return null;
    if (!value.every(isDeliveryQuery)) return null;
    return value;
};
