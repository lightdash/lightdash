import { Button } from '@mantine/core';
import { IconBrandSlack } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { EmptyState } from '../../components/common/EmptyState';
import MantineIcon from '../../components/common/MantineIcon';

const SlackAuthSuccess = () => {
    const { t } = useTranslation('eeMisc');
    const [searchParams] = useSearchParams();

    const slackUrl = useMemo(() => {
        const team = searchParams.get('team');
        const channel = searchParams.get('channel');
        const message = searchParams.get('message');
        const threadTs = searchParams.get('thread_ts');

        if (team && channel) {
            let url = `slack://channel?team=${team}&id=${channel}`;

            if (message) {
                url += `&message=${message}`;

                if (threadTs) {
                    url += `&thread_ts=${threadTs}`;
                }
            }

            return url;
        }

        return 'slack://open';
    }, [searchParams]);

    return (
        <EmptyState
            icon={
                <MantineIcon
                    icon={IconBrandSlack}
                    color="green.6"
                    stroke={1}
                    size="5xl"
                />
            }
            title={t('slackAuth.title')}
            description={t('slackAuth.description')}
        >
            <Button onClick={() => window.open(slackUrl)}>
                {t('slackAuth.openSlack')}
            </Button>
        </EmptyState>
    );
};

export default SlackAuthSuccess;
