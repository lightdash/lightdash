import { Card, Flex, type CardProps } from '@mantine/core';
import { type FC, type PropsWithChildren } from 'react';

export const PAGE_HEADER_HEIGHT = 64;

type Props = PropsWithChildren<{
    cardProps?: Omit<CardProps, 'children'>;
}>;

const PageHeader: FC<Props> = ({ cardProps, children }) => (
    <Card
        component={Flex}
        justify="flex-end"
        align="center"
        pos="relative"
        h={PAGE_HEADER_HEIGHT}
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
        {...cardProps}
    >
        {children}
    </Card>
);

export default PageHeader;
