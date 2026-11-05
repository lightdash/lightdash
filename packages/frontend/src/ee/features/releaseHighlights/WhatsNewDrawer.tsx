import { Drawer, Stack } from '@mantine/core';
import { type FC } from 'react';
import { WhatsNewContent } from './WhatsNewContent';

const WhatsNewDrawer: FC<{ opened: boolean; onClose: () => void }> = ({
    opened,
    onClose,
}) => (
    <Drawer
        opened={opened}
        onClose={onClose}
        position="right"
        size="lg"
        title="What's new"
        closeButtonProps={{ 'aria-label': "Close what's new" }}
    >
        <Stack gap="md">
            <WhatsNewContent layout="drawer" />
        </Stack>
    </Drawer>
);

export default WhatsNewDrawer;
