import { Box } from '@mantine/core';
import { IconLinkOff } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import { useGetShare } from '../hooks/useShare';

const ShareRedirect: FC = () => {
    const { t } = useTranslation('pages');
    const { shareNanoid } = useParams<{ shareNanoid: string }>();
    const { data, error } = useGetShare(shareNanoid);
    const navigate = useNavigate();

    useEffect(() => {
        if (data && data.url) {
            void navigate(data.url, { replace: true });
        }
    }, [data, navigate]);

    if (error) {
        return (
            <Box mt={50}>
                <SuboptimalState
                    title={t('shareRedirect.notFound')}
                    icon={IconLinkOff}
                />
            </Box>
        );
    }
    return (
        <Box mt={50}>
            <SuboptimalState title={t('common.loading')} loading />
        </Box>
    );
};

export default ShareRedirect;
