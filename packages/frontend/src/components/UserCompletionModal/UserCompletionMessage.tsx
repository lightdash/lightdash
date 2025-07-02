import { FC, useEffect } from 'react';
import useToaster from '../../hooks/toaster/useToaster';
import useApp from '../../providers/App/useApp';

const UserCompletionMessage: FC = () => {
    const { user } = useApp();
    const { showToastSuccess } = useToaster();

    useEffect(() => {
        if (user.isSuccess && !user.data?.isSetupComplete) {
            showToastSuccess({
                title: 'Hang tight! We’re ingesting your data. This can take up to a few hours. Send a message to our team if it takes longer than that matt@gosolucia.com.',
                intent: 'primary',
                description: '',
                autoClose: false, // keep it visible
            });
        }
    }, [user, showToastSuccess]);

    return null;
};

export default UserCompletionMessage;
