import {
    type CatalogAnalytics,
    type CatalogMetadata,
    type CatalogSelection,
} from '@lightdash/common';
import {
    createContext,
    useContext,
    useState,
    type Dispatch,
    type FC,
    type SetStateAction,
} from 'react';
import { type ExplorerReduceState } from '../../../providers/ExplorerProvider';

type CatalogContextValues = {
    projectUuid: string;
    metadata: CatalogMetadata | undefined;
    setMetadata: Dispatch<SetStateAction<CatalogMetadata | undefined>>;
    selection: CatalogSelection | undefined;
    setSelection: Dispatch<SetStateAction<CatalogSelection | undefined>>;
    analyticsResults: CatalogAnalytics | undefined;
    setAnalyticsResults: Dispatch<SetStateAction<CatalogAnalytics | undefined>>;
    isSidebarOpen: boolean;
    setSidebarOpen: Dispatch<SetStateAction<boolean>>;
    selectedTable: string | undefined;
    setSelectedTable: Dispatch<SetStateAction<string | undefined>>;
    isViewingCatalog: boolean;
    setIsViewingCatalog: Dispatch<SetStateAction<boolean>>;
    explorerUrlState: ExplorerReduceState['unsavedChartVersion'] | undefined;
    setExplorerUrlState: Dispatch<
        SetStateAction<ExplorerReduceState['unsavedChartVersion'] | undefined>
    >;
    hasSelectedField: boolean;
    setHasSelectedField: Dispatch<SetStateAction<boolean>>;
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
    const [explorerUrlState, setExplorerUrlState] = useState<
        ExplorerReduceState['unsavedChartVersion'] | undefined
    >();
    const [hasSelectedField, setHasSelectedField] = useState<boolean>(false);
    const [isViewingCatalog, setIsViewingCatalog] = useState<boolean>(true);
    const [selectedTable, setSelectedTable] = useState<string | undefined>();
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
                selectedTable,
                setSelectedTable,
                isViewingCatalog,
                setIsViewingCatalog,
                explorerUrlState,
                setExplorerUrlState,
                hasSelectedField,
                setHasSelectedField,
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
