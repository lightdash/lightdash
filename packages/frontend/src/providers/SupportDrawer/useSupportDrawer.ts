import { useContext } from 'react';
import DrawerContext, { type DrawerContextType } from './context';

const useGlobalDrawer = (): DrawerContextType => {
    const context = useContext(DrawerContext);
    if (!context)
        throw new Error('useGlobalDrawer must be used within DrawerProvider');
    return context;
};

export default useGlobalDrawer;
