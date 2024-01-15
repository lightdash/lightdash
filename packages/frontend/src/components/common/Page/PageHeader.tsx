import { Card, CardProps, Flex } from '@mantine/core';
import { FC } from 'react';

export const PAGE_HEADER_HEIGHT = 80;

const PageHeader: FC<React.PropsWithChildren<Pick<CardProps, 'h'>>> = ({
    h,
    children,
}) => (
    <Card
        component={Flex}
        justify="flex-end"
        align="center"
        pos="relative"
        h={h ?? PAGE_HEADER_HEIGHT}
        px="lg"
        py="md"
        bg="white"
        /**
         * FIXME: This shadow should be sourced from Mantine's theme config;
         * Once migration from Blueprint is complete, address default shadow
         */
        shadow="0 0 0 1px #bec1c426"
        radius="unset"
        sx={{ zIndex: 1 }}
    >
        {children}
    </Card>
);

export default PageHeader;
