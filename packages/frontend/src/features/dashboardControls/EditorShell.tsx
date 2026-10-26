import { useDroppable } from '@dnd-kit/core';
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
import { UNSECTIONED_TARGET_ID } from './sections';
import { useRailTop } from './useRailTop';

type Props = {
    /** The dashboard's filters, listed in the rail. */
    filterCount: number;
    onClose: () => void;
    /** While a section header is dragged: it cannot leave a section. */
    isUnsectionTargetDisabled: boolean;
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
    isUnsectionTargetDisabled,
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
    // A row dropped on the header leaves its section
    const { setNodeRef: setDropRef, isOver } = useDroppable({
        id: UNSECTIONED_TARGET_ID,
        disabled: isUnsectionTargetDisabled,
    });
    // Escape leaves the menu with nothing focused; the name input and the
    // new filter's editor take focus before this runs
    const refocusAdd = () =>
        setTimeout(() => {
            if (document.activeElement !== document.body) return;
            document
                .querySelector<HTMLElement>('[data-controls-new-section]')
                ?.focus();
        });
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
                ref={setDropRef}
                justify="space-between"
                wrap="nowrap"
                px="md"
                py="xs"
                className={classes.header}
                data-over={isOver || undefined}
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
                    {/* Focus must stay on the name input New section opens */}
                    {(onAddFilter || onNewSection) && (
                        <Menu
                            position="bottom-end"
                            returnFocus={false}
                            onClose={refocusAdd}
                        >
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
                            onClick={onClose}
                        >
                            {getUiString('filters.rail.done')}
                        </Button>
                    )}
                </Group>
            </Stack>
        </Paper>
    );
};
