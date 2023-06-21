import React, {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
} from 'react';

interface LegendContextType {
    validCartesianConfigLegend: { [key: string]: boolean };
    addLegends: (item: { [key: string]: boolean }) => void;
}

const LegendContext = createContext<LegendContextType | undefined>(undefined);

const LegendProvider: React.FC = ({ children }) => {
    const [validCartesianConfigLegend, setValidCartesianLegendConfig] =
        useState<{
            [key: string]: boolean;
        }>({});

    const addLegends = useCallback((item: { [key: string]: boolean }) => {
        setValidCartesianLegendConfig((prevLegends) => ({
            ...prevLegends,
            ...item,
        }));
    }, []);

    const contextValue: LegendContextType = useMemo(() => {
        return {
            validCartesianConfigLegend,
            addLegends,
        };
    }, [validCartesianConfigLegend, addLegends]);

    return (
        <LegendContext.Provider value={contextValue}>
            {children}
        </LegendContext.Provider>
    );
};

export function useLegend(): LegendContextType {
    const context = useContext(LegendContext);
    if (!context) {
        throw new Error('useLegend must be used within a LegendProvider');
    }
    return context;
}

export default LegendProvider;
