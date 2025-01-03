import type {
    CatalogAnalytics,
    CatalogMetadata,
    CatalogSelection,
} from '@lightdash/common';
import type { Dispatch, SetStateAction } from 'react';

export type CatalogContextValues = {
    projectUuid: string;
    metadata: CatalogMetadata | undefined;
    setMetadata: Dispatch<SetStateAction<CatalogMetadata | undefined>>;
    selection: CatalogSelection | undefined;
    setSelection: Dispatch<SetStateAction<CatalogSelection | undefined>>;
    analyticsResults: CatalogAnalytics | undefined;
    setAnalyticsResults: Dispatch<SetStateAction<CatalogAnalytics | undefined>>;
    isSidebarOpen: boolean;
    setSidebarOpen: Dispatch<SetStateAction<boolean>>;
};
