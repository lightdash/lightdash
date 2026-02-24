import { ActionIcon, Affix, Tooltip, Transition } from '@mantine-8/core';
import { useLocalStorage } from '@mantine-8/hooks';
import { IconMessageCode } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { useActiveProjectUuid } from '../../../../hooks/useActiveProject';
import { AgentCodingChatDrawer } from './AgentCodingChatDrawer';
import classes from './AgentCodingWidget.module.css';

export const AgentCodingWidget: FC = () => {
    const [opened, setOpened] = useLocalStorage({
        key: 'lightdash-build-drawer-open',
        defaultValue: false,
    });
    const open = useCallback(() => setOpened(true), [setOpened]);
    const close = useCallback(() => setOpened(false), [setOpened]);
    const { activeProjectUuid, isLoading } = useActiveProjectUuid();

    // Don't render if we're still loading or no project is active
    if (isLoading || !activeProjectUuid) {
        return null;
    }

    return (
        <>
            <Affix position={{ bottom: 20, right: 20 }}>
                <Transition transition="slide-up" mounted={!opened}>
                    {(transitionStyles) => (
                        <Tooltip
                            label="Coding Sessions"
                            position="left"
                            withArrow
                        >
                            <ActionIcon
                                size={56}
                                radius="xl"
                                variant="filled"
                                onClick={open}
                                style={transitionStyles}
                                className={classes.widget}
                            >
                                <IconMessageCode size={28} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Transition>
            </Affix>

            <AgentCodingChatDrawer
                opened={opened}
                onClose={close}
                projectUuid={activeProjectUuid}
            />
        </>
    );
};
