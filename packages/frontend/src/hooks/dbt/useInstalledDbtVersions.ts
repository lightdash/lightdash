import {
    type ApiError,
    type ApiInstalledDbtVersionsResults,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

const getInstalledDbtVersions = async () =>
    lightdashApi<ApiInstalledDbtVersionsResults>({
        url: `/dbt/installed-versions`,
        method: 'GET',
        body: undefined,
    });

const useInstalledDbtVersions = () =>
    useQuery<ApiInstalledDbtVersionsResults, ApiError>({
        queryKey: ['dbt', 'installed-versions'],
        queryFn: getInstalledDbtVersions,
    });

export default useInstalledDbtVersions;
