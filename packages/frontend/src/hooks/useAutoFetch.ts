import { useLocalStorage } from '@mantine/hooks';
import {
    AUTO_FETCH_ENABLED_DEFAULT,
    AUTO_FETCH_ENABLED_KEY,
} from '../components/RunQuerySettings/defaults';

/**
 * Hook to access auto-fetch setting
 * @returns [autoFetchEnabled, setAutoFetchEnabled] - tuple with current value and setter
 */
export const useAutoFetch = () => {
    return useLocalStorage({
        key: AUTO_FETCH_ENABLED_KEY,
        defaultValue: AUTO_FETCH_ENABLED_DEFAULT,
    });
};
