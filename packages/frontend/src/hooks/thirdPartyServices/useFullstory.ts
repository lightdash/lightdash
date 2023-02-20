import * as Fullstory from '@fullstory/browser';
import { HealthState, LightdashUser } from '@lightdash/common';
import { useEffect, useState } from 'react';

export const useFullstory = (
    config: HealthState['fullstory'] | undefined,
    user: LightdashUser | undefined,
) => {
    const [isFullstoryLoaded, setIsFullstoryLoaded] = useState(false);

    useEffect(() => {
        if (config && !isFullstoryLoaded && config.orgId) {
            Fullstory.init({
                orgId: config.orgId,
                devMode: config.devMode,
            });
            setIsFullstoryLoaded(true);
        }
        if (user && isFullstoryLoaded) {
            Fullstory.identify(user.userUuid, {
                displayName: user.email,
                email: user.email,
            });
        }
    }, [isFullstoryLoaded, setIsFullstoryLoaded, config, user]);
};
