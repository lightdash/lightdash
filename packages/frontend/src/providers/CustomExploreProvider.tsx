import {
    createContext,
    FC,
    PropsWithChildren,
    useContext,
    useEffect,
    useState,
} from 'react';
import useSearchParams from '../hooks/useSearchParams';

type ContextType = {
    sql: string;
    setSql: (sql: string) => void;
};

const Context = createContext<ContextType | undefined>(undefined);

const CustomExploreProvider: FC<PropsWithChildren> = ({ children }) => {
    const base64SqlQuery = useSearchParams('query');

    const [sql, setSql] = useState('');

    useEffect(() => {
        if (base64SqlQuery) {
            setSql(atob(base64SqlQuery));
        }
    }, [base64SqlQuery]);

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
