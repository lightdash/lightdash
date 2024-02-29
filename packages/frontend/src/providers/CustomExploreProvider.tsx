import {
    createContext,
    FC,
    PropsWithChildren,
    useContext,
    useState,
} from 'react';

type ContextType = {
    sql: string;
    setSql: (sql: string) => void;
};

const Context = createContext<ContextType | undefined>(undefined);

const CustomExploreProvider: FC<PropsWithChildren> = ({ children }) => {
    const [sql, setSql] = useState('');

    return (
        <Context.Provider value={{ sql, setSql }}>{children}</Context.Provider>
    );
};

export default CustomExploreProvider;

export const useCustomExplore = () => {
    const context = useContext(Context);

    if (!context) {
        throw new Error(
            'useCustomExplore must be used within a CustomExploreProvider',
        );
    }

    return context;
};
