import { Box, Button } from '@mantine/core';
import { IconBell } from '@tabler/icons-react';
import MantineIcon from '../common/MantineIcon';

const HeadwayMenuItem = () => {
    return (
        <Button variant="default" compact pos="relative">
            <MantineIcon icon={IconBell} />
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
        </Button>
    );
};

export default HeadwayMenuItem;
