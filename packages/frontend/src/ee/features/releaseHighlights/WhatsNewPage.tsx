import { Stack } from '@mantine/core';
import { type FC } from 'react';
import Page from '../../../components/common/Page/Page';
import { WhatsNewContent } from './WhatsNewContent';

const WhatsNewPage: FC = () => (
    <Page title="What's new" withPaddedContent withLargeContent>
        <Stack gap="lg">
            <WhatsNewContent layout="page" />
        </Stack>
    </Page>
);

export default WhatsNewPage;
