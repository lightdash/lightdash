import { interpolateUiString } from '@lightdash/common';
import { Box, Drawer } from '@mantine/core';
import { useState, type FC, type PropsWithChildren } from 'react';
import { StableContent } from '../../../../components/common/StableContent';
import { useUiStrings } from '../../../../ee/providers/Embed/useUiStrings';
import classes from './CanvasSidebar.module.css';

type Props = PropsWithChildren<{
    title: string;
    compact: boolean;
    opened: boolean;
    onClose: () => void;
}>;

/** Only the sidebar changes containers; the sibling canvas stays mounted. */
export const CanvasSidebar: FC<Props> = ({
    title,
    compact,
    opened,
    onClose,
    children,
}) => {
    const [target, setTarget] = useState<HTMLDivElement | null>(null);
    const getUiString = useUiStrings();

    return (
        <>
            {compact ? (
                <Drawer
                    keepMounted
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
                    <Box ref={setTarget} h="100%" />
                </Drawer>
            ) : (
                <Box ref={setTarget} h="100%" />
            )}
            <StableContent target={target}>{children}</StableContent>
        </>
    );
};
