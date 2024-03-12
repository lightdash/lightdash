import {
    ActionIcon,
    Affix,
    Button,
    Divider,
    Drawer,
    Group,
    rem,
    UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconArrowDown } from '@tabler/icons-react';
import { FC, memo, useEffect, useState } from 'react';
import { useExplorerContext } from '../../providers/ExplorerProvider';
import MantineIcon from '../common/MantineIcon';
import SortButton from '../SortButton';
import { ExplorerResults } from './ResultsCard/ExplorerResults';

export const ResultsDrawer: FC = memo(() => {
    const tableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const isEditMode = useExplorerContext(
        (context) => context.state.isEditMode,
    );
    const sorts = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.sorts,
    );

    const hasSorts = tableName && sorts.length > 0;
    const [opened, { open, close }] = useDisclosure(false);
    const [isResizing, setIsResizing] = useState(false);
    const [height, setHeight] = useState(500);

    const onMouseDown = () => {
        setIsResizing(true);
    };

    const onMouseUp = () => {
        setIsResizing(false);
    };

    const onMouseMove = (e: MouseEvent) => {
        if (isResizing) {
            // Calculate the distance from the bottom of the screen to the mouse cursor.
            let offsetBottom = window.innerHeight - e.clientY;
            const minHeight = 50; // Minimum drawer height.
            const maxHeight = 600; // Maximum drawer height.

            // Check if the new height is within bounds and update the height if it is.
            if (offsetBottom > minHeight && offsetBottom < maxHeight) {
                setHeight(offsetBottom);
            }
        }
    };

    useEffect(() => {
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        return () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    });

    return (
        <Affix position={{ bottom: rem(10), right: rem(20) }}>
            <Drawer
                pos="relative"
                p="xs"
                withOverlay={false}
                position="bottom"
                opened={opened}
                onClose={close}
                lockScroll={false}
                size={height}
                withCloseButton={false}
                shadow="md"
            >
                {hasSorts && (
                    <SortButton isEditMode={isEditMode} sorts={sorts} />
                )}
                <UnstyledButton onMouseDown={onMouseDown}>
                    <Divider
                        pos="absolute"
                        top="1px"
                        left="50%"
                        right="50%"
                        w="50px"
                        sx={{
                            cursor: 'n-resize',
                            borderTopWidth: rem(2),
                            borderTopColor: 'gray.5',
                        }}
                    />
                    <Divider
                        pos="absolute"
                        top="5px"
                        left="50%"
                        right="50%"
                        w="50px"
                        sx={{
                            cursor: 'n-resize',
                            borderTopColor: 'gray.5',
                            borderTopWidth: rem(2),
                        }}
                    />
                </UnstyledButton>

                <ActionIcon
                    size="xs"
                    variant="default"
                    pos="absolute"
                    top="5px"
                    right="16px"
                    onClick={close}
                >
                    <MantineIcon icon={IconArrowDown} color="gray" />
                </ActionIcon>

                <ExplorerResults />
            </Drawer>
            <Group position="center">
                <Button
                    compact
                    variant="default"
                    onClick={open}
                    disabled={!tableName}
                >
                    Results
                </Button>
            </Group>
        </Affix>
    );
});
