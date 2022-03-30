import React, {
    createContext,
    Dispatch,
    SetStateAction,
    useContext,
    useState,
} from 'react';

type ActiveSeriesContext = {
    isSeriesActive: boolean;
    setIsSeriesActive: Dispatch<SetStateAction<boolean>>;
};

const Context = createContext<ActiveSeriesContext | undefined>(undefined);

export const ActiveSeriesProvider: React.FC = ({ children }) => {
    const [isSeriesActive, setIsSeriesActive] = useState<boolean>(false);
    return (
        <Context.Provider
            value={{
                isSeriesActive,
                setIsSeriesActive,
            }}
        >
            {children}
        </Context.Provider>
    );
};

export const useActiveSeries = (): ActiveSeriesContext => {
    const context = useContext(Context);
    if (context === undefined) {
        throw new Error(
            'useActiveSeries must be used within a ActiveSeriesProvider',
        );
    }
    return context;
};
