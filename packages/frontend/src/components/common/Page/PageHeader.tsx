import { Card, Flex, type CardProps } from '@mantine/core';
import { type FC, type PropsWithChildren } from 'react';
import classes from './PageHeader.module.css';

type Props = PropsWithChildren<{
    cardProps?: Omit<CardProps, 'children'>;
    mobileLayout?: 'content';
    variant?: 'default' | 'query' | 'dashboard';
}>;

const PageHeader: FC<Props> = ({
    cardProps,
    children,
    mobileLayout,
    variant = 'default',
}) => {
    return (
        <Card
            component={Flex}
            data-testid="page-header"
            data-mobile-layout={mobileLayout}
            data-header-variant={variant}
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
};

export default PageHeader;
