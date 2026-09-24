import { useContext } from 'react';
import {
    ActiveConnectionContext,
    type ActiveConnection,
} from './activeConnectionContext';

export const useActiveConnection = (): ActiveConnection => {
    const context = useContext(ActiveConnectionContext);
    if (!context) {
        throw new Error(
            'useActiveConnection must be used inside ActiveConnectionProvider',
        );
    }
    return context;
};
