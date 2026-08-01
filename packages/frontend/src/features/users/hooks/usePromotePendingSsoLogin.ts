import { useEffect } from 'react';
import useApp from '../../../providers/App/useApp';
import {
    clearPendingSsoLoginMethod,
    readPendingSsoLoginMethod,
    writeLastLoginMethod,
} from '../utils/lastLoginMethod';

/**
 * Turns a pending SSO attempt into the recorded last-login method, using the
 * authenticated user's own email. Belongs on a single mount point that only
 * renders once the user is signed in.
 */
export const usePromotePendingSsoLogin = () => {
    const { user } = useApp();
    const email = user.data?.email;

    useEffect(() => {
        if (!email) return;

        const pendingIssuerType = readPendingSsoLoginMethod();
        if (!pendingIssuerType) return;

        writeLastLoginMethod({ issuerType: pendingIssuerType, email });
        clearPendingSsoLoginMethod();
    }, [email]);
};
