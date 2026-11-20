import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import useToaster from '../../../hooks/toaster/useToaster';

/** Sign-in callbacks land back on the page with their outcome in the query string. */
export const useLiveSourceSignInResult = ({
    onConnected,
}: {
    // Without it, a successful sign-in shows a toast
    onConnected?: (connectionUuid: string) => void;
} = {}) => {
    const { showToastSuccess, showToastError } = useToaster();
    const [searchParams, setSearchParams] = useSearchParams();
    const isPickingGoogleSource =
        searchParams.get('pickGoogleSource') === 'true';
    const closeGoogleSourcePicker = () => {
        searchParams.delete('pickGoogleSource');
        setSearchParams(searchParams, { replace: true });
    };
    useEffect(() => {
        const connected = searchParams.get('connected');
        const signInError = searchParams.get('signInError');
        if (!connected && !signInError) return;
        // Cleared first, so onConnected can navigate elsewhere
        searchParams.delete('connected');
        searchParams.delete('signInError');
        setSearchParams(searchParams, { replace: true });
        if (signInError) {
            showToastError({
                title: 'Could not connect the source',
                subtitle: signInError,
            });
        } else if (connected && onConnected) {
            onConnected(connected);
        } else {
            showToastSuccess({ title: 'Source connected' });
        }
    }, [
        searchParams,
        setSearchParams,
        showToastError,
        showToastSuccess,
        onConnected,
    ]);

    return { isPickingGoogleSource, closeGoogleSourcePicker };
};
