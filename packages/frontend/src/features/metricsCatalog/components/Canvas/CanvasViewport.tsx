import { ActionIcon, Box, Group } from '@mantine/core';
import { useDisclosure, useFocusReturn, useFocusTrap } from '@mantine/hooks';
import { IconMaximize, IconMinimize } from '@tabler/icons-react';
import {
    useEffect,
    type FC,
    type PropsWithChildren,
    type ReactNode,
} from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useUiStrings } from '../../../../ee/providers/Embed/useUiStrings';
import classes from './CanvasViewport.module.css';

type Props = PropsWithChildren<{ navigation: ReactNode }>;

export const CanvasViewport: FC<Props> = ({ navigation, children }) => {
    const [expanded, { toggle, close }] = useDisclosure(false);
    const getUiString = useUiStrings();
    const focusRef = useFocusTrap(expanded);
    useFocusReturn({ opened: expanded });

    useEffect(() => {
        if (!expanded) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [expanded]);

    return (
        <Box
            ref={focusRef}
            className={classes.viewport}
            data-expanded={expanded || undefined}
            role={expanded ? 'dialog' : undefined}
            aria-modal={expanded || undefined}
            aria-label={
                expanded ? getUiString('metrics.canvasLabel') : undefined
            }
            onKeyDown={(event) => {
                // Nested dialogs and open comboboxes handle Escape first.
                if (
                    expanded &&
                    event.key === 'Escape' &&
                    !event.defaultPrevented &&
                    event.target instanceof Element &&
                    !event.target.closest('[aria-expanded="true"]') &&
                    event.target.closest('[role="dialog"]') ===
                        event.currentTarget
                ) {
                    event.stopPropagation();
                    close();
                }
            }}
        >
            <Group justify="space-between" p="xs" wrap="nowrap">
                <Group>{navigation}</Group>
                <ActionIcon
                    variant="default"
                    size={44}
                    aria-label={getUiString(
                        expanded
                            ? 'metrics.exitExpandedCanvas'
                            : 'metrics.expandCanvas',
                    )}
                    aria-pressed={expanded}
                    onClick={toggle}
                >
                    <MantineIcon
                        icon={expanded ? IconMinimize : IconMaximize}
                    />
                </ActionIcon>
            </Group>
            {children}
        </Box>
    );
};
