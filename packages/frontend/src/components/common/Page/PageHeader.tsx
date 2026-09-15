import { Card, Flex, useMatches, type CardProps } from '@mantine/core';
import { type FC, type PropsWithChildren } from 'react';
import { PAGE_HEADER_HEIGHT } from './constants';
import classes from './PageHeader.module.css';

type Props = PropsWithChildren<{
    cardProps?: Omit<CardProps, 'children'>;
}>;

const PageHeader: FC<Props> = ({ cardProps, children }) => {
    const compact = useMatches(
        { base: true, md: false },
        { getInitialValueInEffect: false },
    );
    return (
        <Card
            component={Flex}
            px="lg"
            py="md"
            bg="background"
            withBorder={false}
            shadow="bottomFade"
            radius="unset"
            classNames={{ root: classes.root }}
            {...cardProps}
            h={compact ? 'auto' : (cardProps?.h ?? PAGE_HEADER_HEIGHT)}
            mih={compact ? PAGE_HEADER_HEIGHT : cardProps?.mih}
        >
            {children}
        </Card>
    );
};

export default PageHeader;
