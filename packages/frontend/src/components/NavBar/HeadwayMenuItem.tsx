import { ActionIcon, Box } from '@mantine/core';
import { IconBell } from '@tabler/icons-react';
import MantineIcon from '../common/MantineIcon';

const HeadwayMenuItem = () => {
    return (
        <Box pos="relative">
            <ActionIcon color="gray" variant="light">
                <MantineIcon icon={IconBell} />
            </ActionIcon>

            <Box
                id="headway-badge"
                pos="absolute"
                top={6}
                left={6}
                sx={{
                    '.HW_badge.HW_softHidden': {
                        background: 'transparent',
                    },
                }}
            />
        </Box>
    );
};

export default HeadwayMenuItem;
