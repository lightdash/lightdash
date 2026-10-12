import { Box, Card, Group } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import classes from './ResultsPane.module.css';

type Props = {
    tabs: ReactNode;
    headerElement: ReactNode;
    rightHeaderElement: ReactNode;
    children: ReactNode;
    /** Walkthrough markers for the pane itself. */
    tourProps?: Record<`data-tour-${string}`, string>;
};

const ExplorerPaneLayout: FC<Props> = ({
    tabs,
    headerElement,
    rightHeaderElement,
    children,
    tourProps,
}) => (
    <Card
        p={0}
        className={classes.pane}
        data-explorer-pane
        {...tourProps}
    >
        <Box className={classes.header}>
            <Group gap="sm" wrap="nowrap" miw={0}>
                {tabs}
                {headerElement}
            </Group>
            <Group gap="xs" wrap="nowrap">
                {rightHeaderElement}
            </Group>
        </Box>
        <Box className={classes.body}>{children}</Box>
    </Card>
);

export default ExplorerPaneLayout;
