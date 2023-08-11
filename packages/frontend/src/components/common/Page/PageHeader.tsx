import { Card, Flex } from '@mantine/core';
import { FC } from 'react';

export const PAGE_HEADER_HEIGHT = 80;

const PageHeader: FC = ({ children }) => (
    <Card
        component={Flex}
        justify="flex-end"
        align="center"
        pos="relative"
        h={PAGE_HEADER_HEIGHT}
        px="lg"
        py="md"
        bg="white"
        shadow="0 0 0 1px #bec1c426"
        radius="unset"
        sx={{ zIndex: 1 }}
    >
        {children}
    </Card>
);

export default PageHeader;
