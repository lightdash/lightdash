import { type CatalogMetadata } from '@lightdash/common';
import {
    createContext,
    useContext,
    useState,
    type Dispatch,
    type FC,
    type SetStateAction,
} from 'react';

type CatalogContextValues = {
    metadata: CatalogMetadata | undefined;
    setMetadata: Dispatch<SetStateAction<CatalogMetadata | undefined>>;
    isSidebarOpen: boolean;
    setSidebarOpen: Dispatch<SetStateAction<boolean>>;
};

const CatalogContext = createContext<CatalogContextValues | undefined>(
    undefined,
);

export const CatalogProvider: FC<
    React.PropsWithChildren<
        Pick<CatalogContextValues, 'isSidebarOpen' | 'setSidebarOpen'>
    >
> = ({ isSidebarOpen, setSidebarOpen, children }) => {
    const [metadata, setMetadata] = useState<CatalogMetadata>();

    return (
        <CatalogContext.Provider
            value={{
                metadata,
                setMetadata,
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
