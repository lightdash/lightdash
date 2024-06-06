import {
    type CatalogAnalytics,
    type CatalogMetadata,
    type CatalogSelection,
    type InlineError,
} from '@lightdash/common';
import {
    createContext,
    useContext,
    useState,
    type Dispatch,
    type FC,
    type SetStateAction,
} from 'react';

type CatalogContextValues = {
    projectUuid: string;
    metadata: CatalogMetadata | undefined;
    setMetadata: Dispatch<SetStateAction<CatalogMetadata | undefined>>;
    metadataErrors: InlineError[] | undefined;
    setMetadataErrors: Dispatch<SetStateAction<InlineError[] | undefined>>;
    selection: CatalogSelection | undefined;
    setSelection: Dispatch<SetStateAction<CatalogSelection | undefined>>;
    analyticsResults: CatalogAnalytics | undefined;
    setAnalyticsResults: Dispatch<SetStateAction<CatalogAnalytics | undefined>>;
    isSidebarOpen: boolean;
    setSidebarOpen: Dispatch<SetStateAction<boolean>>;
};

const CatalogContext = createContext<CatalogContextValues | undefined>(
    undefined,
);

export const CatalogProvider: FC<
    React.PropsWithChildren<
        Pick<
            CatalogContextValues,
            'isSidebarOpen' | 'setSidebarOpen' | 'projectUuid'
        >
    >
> = ({ isSidebarOpen, setSidebarOpen, projectUuid, children }) => {
    const [metadata, setMetadata] = useState<CatalogMetadata>();
    const [metadataErrors, setMetadataErrors] = useState<InlineError[]>();
    const [analyticsResults, setAnalyticsResults] =
        useState<CatalogAnalytics>();
    const [selection, setSelection] = useState<CatalogSelection>();

    return (
        <CatalogContext.Provider
            value={{
                projectUuid,
                metadata,
                setMetadata,
                metadataErrors,
                setMetadataErrors,
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

export const useCatalogContext = () => {
    const context = useContext(CatalogContext);
    if (!context) {
        throw new Error(
            'useCatalogContext must be used within a CatalogProvider',
        );
    }
    return context;
};
