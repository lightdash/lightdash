import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Group,
    Menu,
    Paper,
    Stack,
    Text,
    Title,
    Tooltip,
    VisuallyHidden,
} from '@mantine/core';
import {
    IconFilterPlus,
    IconFolderPlus,
    IconPlus,
    IconX,
} from '@tabler/icons-react';
import { useRef, type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import classes from './ControlSidebar.module.css';
import { useRailContractClasses } from './railContractClasses';
import { useRailTop } from './useRailTop';

type Props = {
    /** The dashboard's filters, listed in the rail. */
    filterCount: number;
    onClose: () => void;
    /** The footer's Done: folds the expanded filter, else closes the rail. */
    onDone: () => void;
    /** Set while the filter cannot be kept: the footer offers only this. */
    onCancel: (() => void) | null;
    /** Null while no filter can be added. */
    onAddFilter: (() => void) | null;
    /** Null for a viewer, whose rail has no sections. */
    onNewSection: (() => void) | null;
    footerStatus: string | null;
    children: ReactNode;
};

// The rail: a card next to the grid, stuck under the tabs and filter bar
export const EditorShell: FC<Props> = ({
    filterCount,
    onClose,
    onDone,
    onCancel,
    onAddFilter,
    onNewSection,
    footerStatus,
    children,
}) => {
    const ref = useRef<HTMLDivElement>(null);
    useRailTop(ref);
    const getUiString = useUiStrings();
    const contractClasses = useRailContractClasses();
    return (
        <Paper
            ref={ref}
            className={
                contractClasses
                    ? `${contractClasses.rail} ${classes.root}`
                    : classes.root
            }
            data-controls-editor
        >
            <Group
                justify="space-between"
                wrap="nowrap"
                px="md"
                py="xs"
                className={classes.header}
            >
                <Group gap="xs" wrap="nowrap">
                    <Title order={5}>{getUiString('filters.rail.title')}</Title>
                    {filterCount > 0 && (
                        <Badge size="sm">
                            {filterCount}
                            <VisuallyHidden>
                                {` ${getUiString(
                                    filterCount === 1
                                        ? 'filters.summary.filterSingular'
                                        : 'filters.summary.filterPlural',
                                )}`}
                            </VisuallyHidden>
                        </Badge>
                    )}
                </Group>
                <Group gap={4} wrap="nowrap">
                    {(onAddFilter || onNewSection) && (
                        <Menu position="bottom-end">
                            <Menu.Target>
                                <Tooltip
                                    label={getUiString('filters.rail.add')}
                                >
                                    <ActionIcon
                                        size="sm"
                                        variant="subtle"
                                        color="gray"
                                        aria-label={getUiString(
                                            'filters.rail.add',
                                        )}
                                        data-controls-new-section
                                    >
                                        <MantineIcon icon={IconPlus} />
                                    </ActionIcon>
                                </Tooltip>
                            </Menu.Target>
                            <Menu.Dropdown>
                                {onAddFilter && (
                                    <Menu.Item
                                        fz="xs"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconFilterPlus}
                                                size={14}
                                            />
                                        }
                                        onClick={onAddFilter}
                                    >
                                        {getUiString('filters.addFilter')}
                                    </Menu.Item>
                                )}
                                {onNewSection && (
                                    <Menu.Item
                                        fz="xs"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconFolderPlus}
                                                size={14}
                                            />
                                        }
                                        onClick={onNewSection}
                                    >
                                        New section
                                    </Menu.Item>
                                )}
                            </Menu.Dropdown>
                        </Menu>
                    )}
                    <Tooltip label={getUiString('filters.rail.close')}>
                        <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="gray"
                            aria-label={getUiString('filters.rail.close')}
                            onClick={onClose}
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
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
                                {getUiString('filters.actions.cancel')}
                            </Button>
                        </>
                    ) : (
                        <Button
                            size="xs"
                            ml="auto"
                            className={classes.done}
                            onClick={onDone}
                        >
                            {getUiString('filters.rail.done')}
                        </Button>
                    )}
                </Group>
            </Stack>
        </Paper>
    );
};
