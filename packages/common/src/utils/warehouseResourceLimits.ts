const WAREHOUSE_RESOURCE_LIMIT =
    /bytesBilledLimitExceeded|maximumBytesBilled|bytes billed|resource[_ -]?exhausted|resource limit|memory limit|out of memory|exceeded (?:its |the )?(?:query |warehouse )?(?:limit|quota)/i;

export const isWarehouseResourceLimitError = (message: string): boolean =>
    WAREHOUSE_RESOURCE_LIMIT.test(message);
