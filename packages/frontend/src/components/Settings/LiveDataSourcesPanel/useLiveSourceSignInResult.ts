import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import useToaster from '../../../hooks/toaster/useToaster';

/** Sign-in callbacks land back on the page with their outcome in the query string. */
export const useLiveSourceSignInResult = () => {
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
        if (signInError) {
            showToastError({
                title: 'Could not connect the source',
                subtitle: signInError,
            });
        } else {
            showToastSuccess({ title: 'Source connected' });
        }
        searchParams.delete('connected');
        searchParams.delete('signInError');
        setSearchParams(searchParams, { replace: true });
    }, [searchParams, setSearchParams, showToastError, showToastSuccess]);

    return { isPickingGoogleSource, closeGoogleSourcePicker };
};
