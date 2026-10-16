import { Stack } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import Page from '../../../components/common/Page/Page';
import { WhatsNewContent } from './WhatsNewContent';

const WhatsNewPage: FC = () => {
    const { t } = useTranslation('eeMisc');
    return (
        <Page title={t('whatsNew.title')} withPaddedContent withLargeContent>
            <Stack gap="lg">
                <WhatsNewContent layout="page" />
            </Stack>
        </Page>
    );
};

export default WhatsNewPage;
