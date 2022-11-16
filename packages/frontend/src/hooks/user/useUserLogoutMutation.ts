import { useMutation } from 'react-query';
import { lightdashApi } from '../../api';

const logoutQuery = async () =>
    lightdashApi({
        url: `/logout`,
        method: 'GET',
        body: undefined,
    });

const useLogoutMutation = () => {
    return useMutation(logoutQuery, {
        mutationKey: ['logout'],
        onSuccess: () => {
            window.location.href = '/login';
        },
    });
};

export default useLogoutMutation;
