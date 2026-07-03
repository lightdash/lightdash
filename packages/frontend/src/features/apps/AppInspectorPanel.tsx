import {
    ActionIcon,
    Box,
    Collapse,
    Group,
    ScrollArea,
    Switch,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconChevronDown,
    IconChevronRight,
    IconDatabase,
    IconDatabaseSearch,
    IconTrash,
    IconWorld,
    IconX,
} from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import classes from './AppInspector.module.css';
import { ExternalRequestInspectorContent } from './ExternalRequestInspector';
import type { ExternalRequestEvent, QueryEvent } from './hooks/useAppSdkBridge';
import { QueryInspectorContent } from './QueryInspector';

type InspectorTab = 'queries' | 'external';

type Props = {
    projectUuid: string;
    /** Metric queries for the "Queries" tab. */
    queries: QueryEvent[];
    onClearQueries: () => void;
    onHoverQuery?: (queryUuid: string | null) => void;
    focusedQueryUuid?: string | null;
    /** Data-lineage ("Inspect data") toggle — only shown on the Queries tab.
     *  When `onToggleLineage` is omitted, the toggle is hidden. */
    lineageEnabled?: boolean;
    lineageAvailable?: boolean;
    onToggleLineage?: () => void;
    /** External-connection fetches for the "Requests" tab. The tab is always
     *  shown (even at zero) so it survives a clear and surfaces the feature. */
    externalRequests: ExternalRequestEvent[];
    onClearExternalRequests: () => void;
    /** Persist preference + handler — when omitted, the "Persist" switch is
     *  hidden. Governs both tabs (see `useTrackedAppQueries`). */
    persistLogs?: boolean;
    onPersistLogsChange?: (value: boolean) => void;
    /** Initial value of the internal `collapsed` state. Defaults to `true` so
     *  the builder's panel boots as a collapsed title bar. */
    defaultCollapsed?: boolean;
    /** Called when the user clicks the X. The parent owns visibility and should
     *  unmount the panel in response. */
    onDismiss: () => void;
    /** When `false`, the panel stays visible (as a collapsed title bar) even
     *  with nothing to show. */
    hideWhenEmpty?: boolean;
};

const MIN_HEIGHT = 100;
const MAX_HEIGHT = 600;
const DEFAULT_HEIGHT = 300;

const TabButton: FC<{
    active: boolean;
    icon: ReactNode;
    label: string;
    onSelect: () => void;
}> = ({ active, icon, label, onSelect }) => (
    <Box
        component="button"
        type="button"
        className={`${classes.tab}${active ? ` ${classes.tabActive}` : ''}`}
        onClick={(e) => {
            e.stopPropagation();
            onSelect();
        }}
    >
        {icon}
        <Text size="xs" fw={500}>
            {label}
        </Text>
    </Box>
);

const AppInspectorPanel: FC<Props> = ({
    projectUuid,
    queries,
    onClearQueries,
    onHoverQuery,
    focusedQueryUuid,
    lineageEnabled,
    lineageAvailable,
    onToggleLineage,
    externalRequests,
    onClearExternalRequests,
    persistLogs,
    onPersistLogsChange,
    defaultCollapsed = true,
    onDismiss,
    hideWhenEmpty = true,
}) => {
    const [collapsed, setCollapsed] = useState(defaultCollapsed);
    const [height, setHeight] = useState(DEFAULT_HEIGHT);
    const [activeTab, setActiveTab] = useState<InspectorTab>('queries');
    const dragRef = useRef<{ startY: number; startHeight: number } | null>(
        null,
    );

    const queriesLabel = `Queries (${queries.length})`;
    // Kept short so both tabs fit the collapsed (content-width) title bar.
    const externalLabel = `Requests (${externalRequests.length})`;

    const toggle = useCallback(() => setCollapsed((v) => !v), []);

    const selectTab = useCallback((tab: InspectorTab) => {
        setActiveTab(tab);
        setCollapsed(false);
    }, []);

    const handleResizeStart = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            dragRef.current = { startY: e.clientY, startHeight: height };
        },
        [height],
    );

    const handleResizeMove = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (!dragRef.current) return;
            const delta = dragRef.current.startY - e.clientY;
            const newHeight = Math.min(
                MAX_HEIGHT,
                Math.max(MIN_HEIGHT, dragRef.current.startHeight + delta),
            );
            setHeight(newHeight);
        },
        [],
    );

    const handleResizeEnd = useCallback(() => {
        dragRef.current = null;
    }, []);

    const handleDismiss = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            onDismiss();
        },
        [onDismiss],
    );

    const handleClear = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            if (activeTab === 'external') onClearExternalRequests();
            else onClearQueries();
        },
        [activeTab, onClearExternalRequests, onClearQueries],
    );

    // Auto-uncollapse and switch to the Queries tab when a matching focused
    // query arrives so the focused row is not hidden inside a closed collapse
    // region or behind the other tab.
    useEffect(() => {
        if (
            focusedQueryUuid != null &&
            queries.some((q) => q.queryUuid === focusedQueryUuid)
        ) {
            setCollapsed(false);
            setActiveTab('queries');
        }
    }, [focusedQueryUuid, queries]);

    // Hide the panel entirely only when there's nothing to show *and* the user
    // hasn't engaged with it. Once expanded it stays mounted with an empty
    // state so the next entry lands somewhere visible.
    if (
        hideWhenEmpty &&
        queries.length === 0 &&
        externalRequests.length === 0 &&
        collapsed
    ) {
        return null;
    }

    const clearLabel =
        activeTab === 'external' ? 'Clear external requests' : 'Clear queries';

    return (
        <Box
            className={
                collapsed
                    ? `${classes.container} ${classes.containerCollapsed}`
                    : classes.container
            }
        >
            <Group
                gap="xs"
                wrap="nowrap"
                className={classes.titleBar}
                onClick={toggle}
            >
                {/* Both tabs are always shown — the Requests tab stays visible
                    even at zero (surviving a clear, and surfacing the feature). */}
                <Group gap={2} wrap="nowrap" className={classes.tabBar}>
                    <TabButton
                        active={activeTab === 'queries'}
                        icon={<MantineIcon icon={IconDatabase} size={14} />}
                        label={queriesLabel}
                        onSelect={() => selectTab('queries')}
                    />
                    <TabButton
                        active={activeTab === 'external'}
                        icon={<MantineIcon icon={IconWorld} size={14} />}
                        label={externalLabel}
                        onSelect={() => selectTab('external')}
                    />
                </Group>
                <Box ml="auto" />
                {!collapsed && (
                    <>
                        {onToggleLineage && activeTab === 'queries' && (
                            <Tooltip
                                label={
                                    !lineageAvailable
                                        ? 'Inspect data is not available in this app version — upgrade the app (regenerate it) to enable it'
                                        : lineageEnabled
                                          ? 'Inspect data: on'
                                          : 'Inspect data'
                                }
                                withArrow
                                position="top"
                                maw={260}
                                multiline
                            >
                                {/* data-disabled (not disabled): a truly
                                    disabled button swallows the hover events
                                    the explanatory tooltip needs. */}
                                <ActionIcon
                                    variant={
                                        lineageEnabled ? 'filled' : 'subtle'
                                    }
                                    color={lineageEnabled ? 'violet' : 'gray'}
                                    size="xs"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (!lineageAvailable) return;
                                        onToggleLineage();
                                    }}
                                    data-disabled={
                                        !lineageAvailable || undefined
                                    }
                                    aria-disabled={!lineageAvailable}
                                    aria-label="Toggle data lineage inspector"
                                >
                                    <MantineIcon
                                        icon={IconDatabaseSearch}
                                        size={12}
                                    />
                                </ActionIcon>
                            </Tooltip>
                        )}
                        <Tooltip label={clearLabel} withArrow position="top">
                            <ActionIcon
                                variant="subtle"
                                size="xs"
                                color="gray"
                                onClick={handleClear}
                                aria-label={clearLabel}
                            >
                                <MantineIcon icon={IconTrash} size={12} />
                            </ActionIcon>
                        </Tooltip>
                        {onPersistLogsChange && (
                            <Tooltip
                                label="Preserve logs across iframe refreshes and new app versions"
                                withArrow
                                position="top"
                            >
                                <Box onClick={(e) => e.stopPropagation()}>
                                    <Switch
                                        size="xs"
                                        label="Persist"
                                        checked={persistLogs ?? false}
                                        onChange={(e) =>
                                            onPersistLogsChange(
                                                e.currentTarget.checked,
                                            )
                                        }
                                    />
                                </Box>
                            </Tooltip>
                        )}
                    </>
                )}
                <ActionIcon variant="subtle" size="xs" color="gray">
                    {collapsed ? (
                        <MantineIcon icon={IconChevronRight} size={12} />
                    ) : (
                        <MantineIcon icon={IconChevronDown} size={12} />
                    )}
                </ActionIcon>
                <ActionIcon
                    variant="subtle"
                    size="xs"
                    color="gray"
                    onClick={handleDismiss}
                    aria-label="Close inspector panel"
                >
                    <MantineIcon icon={IconX} size={12} />
                </ActionIcon>
            </Group>
            <Collapse in={!collapsed}>
                <Box
                    className={classes.resizeHandle}
                    onPointerDown={handleResizeStart}
                    onPointerMove={handleResizeMove}
                    onPointerUp={handleResizeEnd}
                />
                <ScrollArea h={height}>
                    {activeTab === 'external' ? (
                        <ExternalRequestInspectorContent
                            requests={externalRequests}
                        />
                    ) : (
                        <QueryInspectorContent
                            queries={queries}
                            projectUuid={projectUuid}
                            onHoverQuery={onHoverQuery}
                            focusedQueryUuid={focusedQueryUuid}
                        />
                    )}
                </ScrollArea>
            </Collapse>
        </Box>
    );
};

export default AppInspectorPanel;
