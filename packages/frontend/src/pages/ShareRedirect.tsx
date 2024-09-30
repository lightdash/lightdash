import { Box } from '@mantine/core';
import { IconLinkOff } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import { useGetShare } from '../hooks/useShare';

const ShareRedirect: FC = () => {
    const { shareNanoid } = useParams<{ shareNanoid: string }>();
    const { data, error } = useGetShare(shareNanoid);
    const history = useHistory();

    useEffect(() => {
        if (data && data.url) {
            history.push(data.url);
        }
    }, [data, history]);

    if (error) {
        return (
            <Box mt={50}>
                <SuboptimalState
                    title={`Shared link does not exist`}
                    icon={IconLinkOff}
                />
            </Box>
        );
    }
    return (
        <Box mt={50}>
            <SuboptimalState title="Loading..." loading />
        </Box>
    );
};

export default ShareRedirect;
