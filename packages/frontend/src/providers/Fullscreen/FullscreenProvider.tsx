import { useEffect, type FC, type PropsWithChildren } from 'react';
import { useLocation } from 'react-router';
import { useToggle } from 'react-use';
import FullscreenContext from './context';

type Props = PropsWithChildren<{ enabled: boolean }>;

const FullscreenProviderEnabled: FC<Props> = ({ children, enabled }) => {
    const [isFullscreen, toggleFullscreen] = useToggle(false);

    const location = useLocation();
    useEffect(() => {
        toggleFullscreen(false);
    }, [toggleFullscreen, location]);

    return (
        <FullscreenContext.Provider
            value={{ enabled, isFullscreen, toggleFullscreen }}
        >
            {children}
        </FullscreenContext.Provider>
    );
};

const FullscreenProviderDisabled: FC<Props> = ({ children }) => {
    return (
        <FullscreenContext.Provider
            value={{
                enabled: false,
                isFullscreen: false,
                toggleFullscreen: () => {},
            }}
        >
            {children}
        </FullscreenContext.Provider>
    );
};

const FullscreenProviderSafe: FC<Props> = (props) => {
    return props.enabled ? (
        <FullscreenProviderEnabled {...props} />
    ) : (
        <FullscreenProviderDisabled {...props} />
    );
};

export default FullscreenProviderSafe;
