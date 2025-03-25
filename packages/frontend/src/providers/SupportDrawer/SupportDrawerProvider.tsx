import { Drawer } from '@mantine/core';
import React, { useState } from 'react';
import DrawerContext from './context';

export const DrawerProvider = ({ children }: { children: React.ReactNode }) => {
    const [opened, setOpened] = useState(false);
    const [content, setContent] = useState<React.ReactNode>(null);
    const [title, setTitle] = useState<string | undefined>(undefined);

    const openDrawer = (
        drawerContent: React.ReactNode,
        drawerTitle?: string,
    ) => {
        setContent(drawerContent);
        setTitle(drawerTitle);
        setOpened(true);
    };

    const closeDrawer = () => {
        setOpened(false);
        setContent(null);
        setTitle(undefined);
    };

    return (
        <DrawerContext.Provider value={{ openDrawer, closeDrawer }}>
            {children}
            <Drawer
                opened={opened}
                onClose={closeDrawer}
                title={title}
                position="right"
                size="md"
            >
                {content}
            </Drawer>
        </DrawerContext.Provider>
    );
};
