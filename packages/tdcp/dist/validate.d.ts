import type { TdcpCapabilities, TdcpCatalog, TdcpDatasetDescriptor } from './types';
export declare const isDatasetDescriptor: (value: unknown) => value is TdcpDatasetDescriptor;
export declare const assertDatasetDescriptor: (value: unknown) => TdcpDatasetDescriptor;
export declare const isCatalog: (value: unknown) => value is TdcpCatalog;
export declare const assertCatalog: (value: unknown) => TdcpCatalog;
export declare const isCapabilities: (value: unknown) => value is TdcpCapabilities;
export declare const assertCapabilities: (value: unknown) => TdcpCapabilities;
//# sourceMappingURL=validate.d.ts.map