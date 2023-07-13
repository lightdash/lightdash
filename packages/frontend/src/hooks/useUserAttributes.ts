import { ApiError, OrgUserAttribute } from '@lightdash/common';
import { useQuery } from 'react-query';
import useQueryError from './useQueryError';

const getUserAttributes = async () =>
    /*lightdashApi<OrgUserAttributes[]>({
        url: `/org/attributes`,
        method: 'GET',
        body: undefined,
    });*/
    Promise.resolve([
        {
            name: 'test',
            description: 'test',
            uuid: 'test',
            organizationUuid: 'test',
            users: [{ userUuid: 'test', value: 'test' }],
        },
    ]);

export const useUserAttributes = () => {
    const setErrorResponse = useQueryError();
    return useQuery<OrgUserAttribute[], ApiError>({
        queryKey: ['user_attributes'],
        queryFn: getUserAttributes,
        onError: (result) => setErrorResponse(result),
    });
};
