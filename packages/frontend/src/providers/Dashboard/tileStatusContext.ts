import { createContext } from 'use-context-selector';
import { type DashboardTileStatusContextType } from './tileStatusTypes';

const DashboardTileStatusContext = createContext<
    DashboardTileStatusContextType | undefined
>(undefined);

export default DashboardTileStatusContext;
