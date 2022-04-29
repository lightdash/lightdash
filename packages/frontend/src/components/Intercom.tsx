import { LightdashMode } from 'common';
import React, { useEffect } from 'react';
import { useIntercom } from 'react-use-intercom';
import { useApp } from '../providers/AppProvider';

export const Intercom: React.FC = () => {
    const { user, health } = useApp();
    const { update } = useIntercom();

    useEffect(() => {
        if (health.data?.mode && health.data.mode !== LightdashMode.DEMO) {
            update(
                user.data
                    ? {
                          userId: user.data.userUuid,
                          name: `${user.data.firstName} ${user.data.lastName}`,
                          email: user.data.email,
                          company: {
                              companyId: user.data.organizationUuid,
                              name: user.data.organizationName,
                          },
                          customAttributes: {
                              role: user.data.role,
                              is_setup_complete: user.data.isSetupComplete,
                          },
                      }
                    : undefined,
            );
        }
    }, [update, health, user]);

    return null;
};
