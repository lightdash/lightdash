import { Series } from 'common';
import React, {
    createContext,
    Dispatch,
    SetStateAction,
    useContext,
    useState,
} from 'react';

interface ActiveSeries extends Series {
    isOpen?: boolean;
}

type ActiveSeriesContext = {
    isSeriesActive: ActiveSeries[];
    setIsSeriesActive: Dispatch<SetStateAction<ActiveSeries[]>>;
};

const Context = createContext<ActiveSeriesContext | undefined>(undefined);

export const ActiveSeriesProvider: React.FC = ({ children }) => {
    const [isSeriesActive, setIsSeriesActive] = useState<ActiveSeries[]>([]);
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
