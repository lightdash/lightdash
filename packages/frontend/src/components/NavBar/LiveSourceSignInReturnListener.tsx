import { useEffect, type FC } from 'react';
import { useLocation, useNavigate } from 'react-router';
import useToaster from '../../hooks/toaster/useToaster';

const SIGNED_IN = 'liveSourceSignedIn';
const SIGN_IN_ERROR = 'liveSourceSignInError';

/**
 * A viewer coming back from signing in to a live source: says how it went,
 * then drops the result from the address so a reload doesn't say it again.
 */
const LiveSourceSignInReturnListener: FC = () => {
    const { pathname, search, hash } = useLocation();
    const navigate = useNavigate();
    const { showToastSuccess, showToastError } = useToaster();

    useEffect(() => {
        const params = new URLSearchParams(search);
        const signedIn = params.has(SIGNED_IN);
        const error = params.get(SIGN_IN_ERROR);
        if (!signedIn && error === null) return;

        if (error !== null) {
            // Only fixed copy: the address can be anyone's link
            showToastError({
                title:
                    error === 'cancelled'
                        ? 'Sign-in was cancelled'
                        : "Couldn't connect your account. Try again.",
            });
        } else {
            showToastSuccess({ title: 'Account connected' });
        }
        params.delete(SIGNED_IN);
        params.delete(SIGN_IN_ERROR);
        const rest = params.toString();
        void navigate(`${pathname}${rest ? `?${rest}` : ''}${hash}`, {
            replace: true,
        });
    }, [pathname, search, hash, navigate, showToastError, showToastSuccess]);

    return null;
};

export default LiveSourceSignInReturnListener;
