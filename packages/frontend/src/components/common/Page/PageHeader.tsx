import { Card, Flex, type CardProps } from '@mantine-8/core';
import { type FC, type PropsWithChildren } from 'react';
import { PAGE_HEADER_HEIGHT } from './constants';
import classes from './PageHeader.module.css';

type Props = PropsWithChildren<{
    cardProps?: Omit<CardProps, 'children'>;
}>;

const PageHeader: FC<Props> = ({ cardProps, children }) => (
    <Card
        component={Flex}
        pos="relative"
        h={PAGE_HEADER_HEIGHT}
        px="lg"
        py="md"
        bg="background"
        withBorder={false}
        shadow="bottomFade"
        radius="unset"
        classNames={{ root: classes.root }}
        {...cardProps}
    >
        {children}
    </Card>
);

export default PageHeader;
