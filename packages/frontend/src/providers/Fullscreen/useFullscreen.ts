import { useContext } from 'react';
import FullscreenContext from './context';

const useFullscreen = () => {
    const context = useContext(FullscreenContext);

    if (!context) {
        throw new Error(
            'useFullscreen must be used within a FullscreenProvider',
        );
    }

    return context;
};

export default useFullscreen;
