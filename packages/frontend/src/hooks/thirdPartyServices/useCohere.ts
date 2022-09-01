import { HealthState, LightdashUser } from '@lightdash/common';
import Cohere from 'cohere-js';
import { useEffect, useState } from 'react';

const useCohere = (
    cohereConfig: HealthState['cohere'] | undefined,
    user: LightdashUser | undefined,
) => {
    const [isCohereLoaded, setIsCohereLoaded] = useState(false);

    useEffect(() => {
        if (!isCohereLoaded && cohereConfig && cohereConfig.token.length > 0) {
            Cohere.init(cohereConfig.token);
            setIsCohereLoaded(true);
        }
        if (user) {
            Cohere.identify(user.userUuid, {
                displayName: `${user.firstName} ${user.lastName}`,
                email: user.email,
            });
        }
    }, [cohereConfig, isCohereLoaded, user]);
};

export default useCohere;
