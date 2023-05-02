import { Card, Flex, MantineSize } from '@mantine/core';
import { FC } from 'react';

export const PAGE_HEADER_HEIGHT = 80;

const PageHeader: FC = ({ children }) => {
    return (
        <Card
            component={Flex}
            justify="flex-end"
            align="center"
            pos="relative"
            h={PAGE_HEADER_HEIGHT}
            px="lg"
            py="md"
            bg="white"
            shadow="xs"
            radius="unset"
            withBorder
            sx={{
                borderTop: 'unset',
                borderLeft: 'unset',
                borderRight: 'unset',
            }}
        >
            {children}
        </Card>
    );
};

export default PageHeader;
