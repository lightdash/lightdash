import { Drawer } from '@mantine/core';
import React, { useState } from 'react';
import SupportDrawerContent from './SupportDrawerContent';
import DrawerContext from './context';

export const SupportDrawerProvider = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const [opened, setOpened] = useState(false);

    const openSupportDrawer = () => {
        setOpened(true);
    };

    const closeSupportDrawer = () => {
        setOpened(false);
    };

    return (
        <DrawerContext.Provider
            value={{ openSupportDrawer, closeSupportDrawer }}
        >
            {children}
            <Drawer
                opened={opened}
                onClose={closeSupportDrawer}
                title="Share with Lightdash Support"
                position="right"
                size="md"
                zIndex={1000}
            >
                <SupportDrawerContent />
            </Drawer>
        </DrawerContext.Provider>
    );
};
