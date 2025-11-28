import { Card, Flex, useMantineTheme, type CardProps } from '@mantine/core';
import { type FC, type PropsWithChildren } from 'react';
import { PAGE_HEADER_HEIGHT } from './constants';

type Props = PropsWithChildren<{
    cardProps?: Omit<CardProps, 'children'>;
}>;

const PageHeader: FC<Props> = ({ cardProps, children }) => {
    const theme = useMantineTheme();

    return (
        <Card
            component={Flex}
            align="center"
            pos="relative"
            h={PAGE_HEADER_HEIGHT}
            px="lg"
            py="md"
            bg={theme.colorScheme === 'dark' ? theme.colors.dark[7] : 'white'}
            /**
             * FIXME: This shadow should be sourced from Mantine's theme config;
             * Once migration from Blueprint is complete, address default shadow
             */
            withBorder={false}
            shadow="0 0 0 1px #bec1c426"
            radius="unset"
            sx={{ zIndex: 1 }}
            {...cardProps}
        >
            {children}
        </Card>
    );
};

export default PageHeader;
