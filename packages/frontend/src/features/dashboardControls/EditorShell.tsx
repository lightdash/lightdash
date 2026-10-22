import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Group,
    Paper,
    Stack,
    Text,
    Title,
    Tooltip,
    VisuallyHidden,
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useRef, type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { AddControl } from './AddControl';
import classes from './ControlSidebar.module.css';
import { useRailTop } from './useRailTop';

type Props = {
    /** The dashboard's filters, listed in the rail. */
    filterCount: number;
    onClose: () => void;
    /** Set while the filter cannot be kept: the footer offers only this. */
    onCancel: (() => void) | null;
    footerStatus: string | null;
    children: ReactNode;
};

// The rail: a card next to the grid, stuck under the tabs and filter bar
export const EditorShell: FC<Props> = ({
    filterCount,
    onClose,
    onCancel,
    footerStatus,
    children,
}) => {
    const ref = useRef<HTMLDivElement>(null);
    useRailTop(ref);
    return (
        <Paper ref={ref} className={classes.root} data-controls-editor>
            <Group
                justify="space-between"
                wrap="nowrap"
                pl="md"
                pr="xs"
                py="xs"
                className={classes.header}
            >
                <Group gap="xs" wrap="nowrap">
                    <Title order={5}>Filters</Title>
                    <Badge size="sm">
                        {filterCount}
                        <VisuallyHidden> filters</VisuallyHidden>
                    </Badge>
                </Group>
                <Tooltip label="Close">
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label="Close"
                        onClick={onClose}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Tooltip>
            </Group>

            <Box className={classes.body}>{children}</Box>

            <Stack gap="xs" p="sm" className={classes.footer}>
                {footerStatus !== null && !onCancel && (
                    <Text
                        key={footerStatus}
                        fz="xs"
                        c="dimmed"
                        className={classes.footerStatus}
                    >
                        {footerStatus}
                    </Text>
                )}
                <Group justify="space-between" gap="xs" wrap="nowrap">
                    {onCancel ? (
                        <>
                            <Text
                                key={footerStatus}
                                fz="xs"
                                c="dimmed"
                                className={classes.footerStatus}
                            >
                                {footerStatus}
                            </Text>
                            <Button
                                variant="subtle"
                                color="gray"
                                size="xs"
                                flex="0 0 auto"
                                onClick={onCancel}
                            >
                                Cancel
                            </Button>
                        </>
                    ) : (
                        <>
                            <AddControl placement="rail" />
                            <Button
                                size="xs"
                                className={classes.done}
                                onClick={onClose}
                            >
                                Done
                            </Button>
                        </>
                    )}
                </Group>
            </Stack>
        </Paper>
    );
};
