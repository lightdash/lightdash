import { Drawer, Stack } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { WhatsNewContent } from './WhatsNewContent';

const WhatsNewDrawer: FC<{ opened: boolean; onClose: () => void }> = ({
    opened,
    onClose,
}) => {
    const { t } = useTranslation('eeMisc');
    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            position="right"
            size="lg"
            title={t('whatsNew.title')}
            closeButtonProps={{ 'aria-label': t('whatsNew.close') }}
        >
            <Stack gap="md">
                <WhatsNewContent layout="drawer" />
            </Stack>
        </Drawer>
    );
};

export default WhatsNewDrawer;
