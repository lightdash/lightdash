import {
    type CatalogAnalytics,
    type CatalogMetadata,
    type CatalogSelection,
} from '@lightdash/common';
import { useState, type FC } from 'react';
import CatalogContext from './context';
import { type CatalogContextValues } from './types';

export const CatalogProvider: FC<
    React.PropsWithChildren<
        Pick<
            CatalogContextValues,
            'isSidebarOpen' | 'setSidebarOpen' | 'projectUuid'
        >
    >
> = ({ isSidebarOpen, setSidebarOpen, projectUuid, children }) => {
    const [metadata, setMetadata] = useState<CatalogMetadata>();
    const [analyticsResults, setAnalyticsResults] =
        useState<CatalogAnalytics>();
    const [selection, setSelection] = useState<CatalogSelection>();

    return (
        <CatalogContext.Provider
            value={{
                projectUuid,
                metadata,
                setMetadata,
                selection,
                setSelection,
                analyticsResults,
                setAnalyticsResults,
                isSidebarOpen,
                setSidebarOpen,
            }}
        >
            {children}
        </CatalogContext.Provider>
    );
};
