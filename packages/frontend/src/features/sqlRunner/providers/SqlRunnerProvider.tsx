import {
    createContext,
    useContext,
    useState,
    type Dispatch,
    type FC,
    type SetStateAction,
} from 'react';

type SqlRunnerContextValues = {
    projectUuid: string;
    activeTable: string | undefined;
    setActiveTable: Dispatch<SetStateAction<string | undefined>>;
    activeFields: Set<string> | undefined;
    setActiveFields: Dispatch<SetStateAction<Set<string> | undefined>>;
};

const SqlRunnerContext = createContext<SqlRunnerContextValues | undefined>(
    undefined,
);

export const SqlRunnerProvider: FC<
    React.PropsWithChildren<Pick<SqlRunnerContextValues, 'projectUuid'>>
> = ({ projectUuid, children }) => {
    const [activeTable, setActiveTable] = useState<string | undefined>();
    const [activeFields, setActiveFields] = useState<Set<string> | undefined>();

    return (
        <SqlRunnerContext.Provider
            value={{
                projectUuid,
                activeTable,
                setActiveTable,
                activeFields,
                setActiveFields,
            }}
        >
            {children}
        </SqlRunnerContext.Provider>
    );
};

export const useSqlRunnerProvider = () => {
    const context = useContext(SqlRunnerContext);
    if (!context) {
        throw new Error(
            'useSqlRunnerProvider must be used within a SqlRunnerProvider',
        );
    }
    return context;
};
