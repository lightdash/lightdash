import React, { useEffect } from 'react';
import { useIntercom } from 'react-use-intercom';
import { useApp } from '../providers/AppProvider';

export const Intercom: React.FC = () => {
    const { user } = useApp();
    const { update } = useIntercom();

    useEffect(() => {
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
    }, [update, user]);

    return null;
};
