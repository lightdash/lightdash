import { FC } from 'react';
import { IntercomProvider } from 'react-use-intercom';
import { Intercom } from '../components/Intercom';
import useCohere from '../hooks/thirdPartyServices/useCohere';
import { useFullstory } from '../hooks/thirdPartyServices/useFullstory';
import useHeadway from '../hooks/thirdPartyServices/useHeadway';
import useSentry from '../hooks/thirdPartyServices/useSentry';
import { useApp } from './AppProvider';

const ThirdPartyServicesEnabledProvider: FC = ({ children }) => {
    const { health, user } = useApp();

    useSentry(health?.data?.sentry, user.data);
    useCohere(health?.data?.cohere, user.data);
    useHeadway();
    useFullstory(health?.data?.fullstory, user.data);

    return (
        <IntercomProvider
            appId={health.data?.intercom.appId || ''}
            shouldInitialize={!!health.data?.intercom.appId}
            apiBase={health.data?.intercom.apiBase || ''}
            autoBoot
        >
            <Intercom />
            {children}
        </IntercomProvider>
    );
};

interface ThirdPartyServicesProviderProps {
    enabled?: boolean;
}

const ThirdPartyServicesProvider: FC<ThirdPartyServicesProviderProps> = ({
    children,
    enabled,
}) => {
    if (enabled) {
        return (
            <ThirdPartyServicesEnabledProvider>
                {children}
            </ThirdPartyServicesEnabledProvider>
        );
    } else {
        return <>{children}</>;
    }
};

export default ThirdPartyServicesProvider;
