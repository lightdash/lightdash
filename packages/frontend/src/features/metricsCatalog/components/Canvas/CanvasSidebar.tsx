import { interpolateUiString } from '@lightdash/common';
import { Box, Drawer, useMantineTheme } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { type FC, type PropsWithChildren } from 'react';
import { useUiStrings } from '../../../../ee/providers/Embed/useUiStrings';
import classes from './CanvasSidebar.module.css';

type Props = PropsWithChildren<{
    title: string;
    opened: boolean;
    onClose: () => void;
}>;

/** Only the sidebar changes containers; the sibling canvas stays mounted. */
export const CanvasSidebar: FC<Props> = ({
    title,
    opened,
    onClose,
    children,
}) => {
    const theme = useMantineTheme();
    const getUiString = useUiStrings();
    const isCompact = useMediaQuery(
        `(width < ${theme.breakpoints.md})`,
        undefined,
        {
            getInitialValueInEffect: false,
        },
    );

    if (isCompact) {
        return (
            <Drawer
                opened={opened}
                onClose={onClose}
                title={title}
                size="min(420px, 100vw)"
                closeButtonProps={{
                    size: 44,
                    'aria-label': interpolateUiString(
                        getUiString('metrics.closeSidebar'),
                        { sidebar: title },
                    ),
                }}
                classNames={{
                    body: classes.drawerBody,
                    content: classes.drawerContent,
                }}
            >
                {children}
            </Drawer>
        );
    }

    return <Box h="100%">{children}</Box>;
};
