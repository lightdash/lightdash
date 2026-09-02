import { type SavedChart } from '@lightdash/common';
import { createContext, useContext } from 'react';

type ModalHostedValue = {
    /** True when Explorer is inside a modal; saving must not navigate away. */
    isModalHosted: boolean;
    /** Hands the saved chart back to the host so it can stage a tile. */
    onChartSaved?: (chart: SavedChart) => void;
    /** Dashboard context for the save dialog, bypassing sessionStorage. */
    dashboard?: { uuid: string; name: string };
};

export const ModalHostedContext = createContext<ModalHostedValue>({
    isModalHosted: false,
});

export const useIsModalHosted = (): boolean =>
    useContext(ModalHostedContext).isModalHosted;

export const useModalHostedChartSaved = ():
    | ((chart: SavedChart) => void)
    | undefined => useContext(ModalHostedContext).onChartSaved;

export const useModalHostedDashboard = ():
    | { uuid: string; name: string }
    | undefined => useContext(ModalHostedContext).dashboard;
