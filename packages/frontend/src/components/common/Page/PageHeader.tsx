import { Card, Flex } from '@mantine/core';
import { FC, ReactNode } from 'react';

export const PAGE_HEADER_HEIGHT = 80;

type Props = { withShadow?: boolean; children: ReactNode };

const PageHeader: FC<Props> = ({ withShadow, children }) => (
    <Card
        component={Flex}
        justify="flex-end"
        align="center"
        pos="relative"
        h={PAGE_HEADER_HEIGHT}
        px="lg"
        py="md"
        bg="white"
        shadow={withShadow ? 'xs' : 'none'}
        radius="unset"
        sx={{ zIndex: 1 }}
    >
        {children}
    </Card>
);

export default PageHeader;
