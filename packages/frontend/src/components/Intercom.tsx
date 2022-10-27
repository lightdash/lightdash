import { LightdashMode } from '@lightdash/common';
import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useIntercom } from 'react-use-intercom';
import { useApp } from '../providers/AppProvider';

const LOCATIONS_WITH_INTERCOM = ['/welcome', '/register', '/login', '/invite'];

export const Intercom: React.FC = () => {
    const { user, health } = useApp();
    const { update } = useIntercom();
    const { pathname } = useLocation();

    useEffect(() => {
        if (
            LOCATIONS_WITH_INTERCOM.some((locationWithIntercom) =>
                pathname.includes(locationWithIntercom),
            )
        ) {
            update({
                hideDefaultLauncher: false,
            });
        } else {
            update({
                hideDefaultLauncher: true,
            });
        }
    }, [pathname, update]);

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
                              createdAt:
                                  user.data.organizationCreatedAt.toString(),
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
