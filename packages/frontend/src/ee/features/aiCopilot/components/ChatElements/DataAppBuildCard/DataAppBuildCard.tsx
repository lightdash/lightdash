import { assertUnreachable } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Menu,
    Paper,
    Stack,
    Text,
    ThemeIcon,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconAppWindow,
    IconArrowRight,
    IconChevronDown,
    IconCircleMinus,
    IconEye,
} from '@tabler/icons-react';
import clsx from 'clsx';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import AppVersionNarration from '../../../../../../features/apps/components/AppVersionNarration';
import { formatBuildDuration } from '../../../../../../features/apps/utils/formatBuildDuration';
import { type AppVersionNarrationData } from '../../../../../../features/apps/utils/versionNarration';
import styles from './DataAppBuildCard.module.css';

export type DataAppBuildCardState =
    | { kind: 'queued' }
    | {
          kind: 'building';
          statusMessage: string;
          narration: AppVersionNarrationData;
      }
    | {
          kind: 'ready';
          name: string;
          version: number;
          durationMs: number | null;
          completionMessage: string;
      }
    | { kind: 'failed'; message: string }
    | { kind: 'cancelled' }
    | { kind: 'unavailable' };

type Props = {
    state: DataAppBuildCardState;
    /** Earlier turns: ready and failed collapse to a single row. */
    compact: boolean;
    /** This app is the one open in the preview panel. */
    isActive: boolean;
    onOpenBuilder: () => void;
    onView: () => void;
};

const FAILED_TITLE = "The app couldn't be built";

const readySubtitle = (
    state: Extract<DataAppBuildCardState, { kind: 'ready' }>,
) =>
    state.durationMs === null
        ? `v${state.version}`
        : `v${state.version} · built in ${formatBuildDuration(state.durationMs)}`;

const BuilderButton: FC<{
    label: 'Continue in builder' | 'Open in builder';
    onClick: () => void;
}> = ({ label, onClick }) => (
    <Button variant="default" size="compact-xs" onClick={onClick}>
        {label}
    </Button>
);

/** View opens the preview; the chevron holds the secondary actions. */
const ViewSplitButton: FC<{
    onView: () => void;
    onOpenBuilder: () => void;
}> = ({ onView, onOpenBuilder }) => (
    <Box className={styles.split}>
        <Button
            variant="default"
            size="compact-xs"
            className={styles.splitMain}
            leftSection={<MantineIcon icon={IconEye} size={14} />}
            onClick={onView}
        >
            View
        </Button>
        <Menu position="bottom-end" withinPortal shadow="md">
            <Menu.Target>
                <ActionIcon
                    variant="default"
                    size={22}
                    className={styles.splitMenuButton}
                    aria-label="More actions"
                >
                    <MantineIcon icon={IconChevronDown} size={12} />
                </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown p={4}>
                <Menu.Item
                    fz="xs"
                    py={4}
                    leftSection={
                        <MantineIcon icon={IconArrowRight} size={14} />
                    }
                    onClick={onOpenBuilder}
                >
                    Continue in builder
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    </Box>
);

const CardIcon: FC<{ tone: 'default' | 'error' | 'muted' }> = ({ tone }) => (
    <ThemeIcon
        size="sm"
        variant={tone === 'error' ? 'light' : 'default'}
        color={tone === 'error' ? 'red' : undefined}
        c={tone === 'muted' ? 'ldGray.5' : undefined}
    >
        <MantineIcon
            icon={tone === 'error' ? IconAlertTriangle : IconAppWindow}
            size={14}
        />
    </ThemeIcon>
);

/** Icon + title (+ subtitle) cell; sits left of the actions on wide cards. */
const Lead: FC<{ icon: ReactNode; children: ReactNode }> = ({
    icon,
    children,
}) => (
    <Box className={styles.lead}>
        {icon}
        <Stack gap={0} className={styles.leadText}>
            {children}
        </Stack>
    </Box>
);

const Actions: FC<{ children: ReactNode }> = ({ children }) => (
    <Box className={styles.actions}>{children}</Box>
);

/** Full-width cell indented to the title's left edge. */
const Body: FC<{ children: ReactNode }> = ({ children }) => (
    <Box className={styles.body}>{children}</Box>
);

const Title: FC<{ children: ReactNode }> = ({ children }) => (
    <Text size="xs" fw={500} truncate>
        {children}
    </Text>
);

const Muted: FC<{ children: ReactNode }> = ({ children }) => (
    <Text size="xs" c="ldGray.6">
        {children}
    </Text>
);

/** One-line "title · detail" header used by rows that must stay single-line. */
const InlineTitle: FC<{ title: string; detail: string }> = ({
    title,
    detail,
}) => (
    <Text size="xs" truncate>
        <Text span fw={500} inherit>
            {title}
        </Text>
        <Text span c="ldGray.6" inherit>
            {' · '}
        </Text>
        <Text span c="ldGray.6" inherit>
            {detail}
        </Text>
    </Text>
);

const renderCells = (
    state: DataAppBuildCardState,
    compact: boolean,
    onOpenBuilder: () => void,
    onView: () => void,
): ReactNode => {
    switch (state.kind) {
        case 'queued':
            return (
                <>
                    <Lead icon={<CardIcon tone="default" />}>
                        <Title>Building data app</Title>
                    </Lead>
                    <Actions>
                        <BuilderButton
                            label="Continue in builder"
                            onClick={onOpenBuilder}
                        />
                    </Actions>
                    <Body>
                        <Muted>
                            Starting the build. This can take a few minutes.
                        </Muted>
                    </Body>
                </>
            );
        case 'building':
            return (
                <>
                    <Box className={styles.full}>
                        <Lead icon={<CardIcon tone="default" />}>
                            <InlineTitle
                                title="Building data app"
                                detail={state.statusMessage}
                            />
                        </Lead>
                    </Box>
                    <Box className={styles.full}>
                        <AppVersionNarration
                            narration={state.narration}
                            isLive
                        />
                    </Box>
                    <Box className={styles.lead}>
                        <Muted>
                            Builds in the background, so it's safe to close the
                            tab.
                        </Muted>
                    </Box>
                    <Actions>
                        <BuilderButton
                            label="Continue in builder"
                            onClick={onOpenBuilder}
                        />
                    </Actions>
                </>
            );
        case 'ready':
            if (compact) {
                return (
                    <>
                        <Lead icon={<CardIcon tone="default" />}>
                            <InlineTitle
                                title={state.name}
                                detail={readySubtitle(state)}
                            />
                        </Lead>
                        <Actions>
                            <ViewSplitButton
                                onView={onView}
                                onOpenBuilder={onOpenBuilder}
                            />
                        </Actions>
                    </>
                );
            }
            return (
                <>
                    <Lead icon={<CardIcon tone="default" />}>
                        <Title>{state.name}</Title>
                        <Muted>{readySubtitle(state)}</Muted>
                    </Lead>
                    <Actions>
                        <ViewSplitButton
                            onView={onView}
                            onOpenBuilder={onOpenBuilder}
                        />
                    </Actions>
                    <Body>
                        <Text size="xs">{state.completionMessage}</Text>
                    </Body>
                </>
            );
        case 'failed':
            if (compact) {
                return (
                    <>
                        <Lead icon={<CardIcon tone="error" />}>
                            <Text size="xs" c="ldGray.6" lineClamp={2}>
                                {`${FAILED_TITLE}. ${state.message}`}
                            </Text>
                        </Lead>
                        <Actions>
                            <BuilderButton
                                label="Open in builder"
                                onClick={onOpenBuilder}
                            />
                        </Actions>
                    </>
                );
            }
            return (
                <>
                    <Lead icon={<CardIcon tone="error" />}>
                        <Title>{FAILED_TITLE}</Title>
                    </Lead>
                    <Actions>
                        <BuilderButton
                            label="Open in builder"
                            onClick={onOpenBuilder}
                        />
                    </Actions>
                    <Body>
                        <Muted>{state.message}</Muted>
                    </Body>
                </>
            );
        case 'cancelled':
            return (
                <>
                    <Lead
                        icon={
                            <ThemeIcon size="sm" variant="default">
                                <MantineIcon icon={IconCircleMinus} size={14} />
                            </ThemeIcon>
                        }
                    >
                        <Title>Build cancelled</Title>
                    </Lead>
                    <Actions>
                        <BuilderButton
                            label="Open in builder"
                            onClick={onOpenBuilder}
                        />
                    </Actions>
                </>
            );
        case 'unavailable':
            return (
                <Lead icon={<CardIcon tone="muted" />}>
                    <Muted>This app is no longer available.</Muted>
                </Lead>
            );
        default:
            return assertUnreachable(state, 'Unknown build card state');
    }
};

/**
 * Presentational build card shown under the agent's reply. Pure function of
 * `state`; navigation and data live in the caller.
 */
export const DataAppBuildCard: FC<Props> = ({
    state,
    compact,
    isActive,
    onOpenBuilder,
    onView,
}) => (
    <Paper
        withBorder
        p="sm"
        radius="md"
        className={clsx(styles.card, {
            [styles.cardUnavailable]: state.kind === 'unavailable',
            [styles.cardActive]: isActive,
        })}
    >
        <Box className={styles.layout}>
            {renderCells(state, compact, onOpenBuilder, onView)}
        </Box>
    </Paper>
);
