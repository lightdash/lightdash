import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

const useSearchParams = <T = string>(param: string) => {
    const location = useLocation();
    return useMemo(() => {
        const queryParams = new URLSearchParams(location.search);
        return queryParams.get(param) as T | null;
    }, [param, location.search]);
};

export default useSearchParams;
