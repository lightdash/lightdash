import { useContext } from 'react';
import SupportDrawerContext, { type SupportDrawerContextType } from './context';

const useSupportDrawer = (): SupportDrawerContextType => {
    const context = useContext(SupportDrawerContext);
    if (!context)
        throw new Error(
            'useSupportDrawer must be used within SupportDrawerProvider',
        );
    return context;
};

export default useSupportDrawer;
