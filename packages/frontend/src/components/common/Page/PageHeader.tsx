import { Card, Flex, useMatches, type CardProps } from '@mantine/core';
import { type FC, type PropsWithChildren } from 'react';
import { PAGE_HEADER_HEIGHT } from './constants';
import classes from './PageHeader.module.css';

type Props = PropsWithChildren<{
    cardProps?: Omit<CardProps, 'children'>;
    mobileLayout?: 'content';
}>;

const PageHeader: FC<Props> = ({ cardProps, children, mobileLayout }) => {
    const compact = useMatches(
        { base: true, sm: false },
        { getInitialValueInEffect: false },
    );
    return (
        <Card
            component={Flex}
            data-mobile-layout={mobileLayout}
            bg="background"
            withBorder={false}
            shadow="bottomFade"
            radius="unset"
            classNames={{ root: classes.root }}
            {...cardProps}
            px={
                compact && mobileLayout === 'content'
                    ? 16
                    : (cardProps?.px ?? 'lg')
            }
            py={
                compact && mobileLayout === 'content'
                    ? 8
                    : (cardProps?.py ?? 'md')
            }
            h={compact ? 'auto' : (cardProps?.h ?? PAGE_HEADER_HEIGHT)}
            mih={compact ? PAGE_HEADER_HEIGHT : cardProps?.mih}
        >
            {children}
        </Card>
    );
};

export default PageHeader;
