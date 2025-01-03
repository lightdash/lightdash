import { Box } from '@mantine/core';
import { IconLinkOff } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { useNavigate, useParams } from 'react-router';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import { useGetShare } from '../hooks/useShare';

const ShareRedirect: FC = () => {
    const { shareNanoid } = useParams<{ shareNanoid: string }>();
    const { data, error } = useGetShare(shareNanoid);
    const navigate = useNavigate();

    useEffect(() => {
        if (data && data.url) {
            void navigate(data.url);
        }
    }, [data, navigate]);

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
