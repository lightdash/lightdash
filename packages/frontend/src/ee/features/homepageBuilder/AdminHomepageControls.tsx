import { subject } from '@casl/ability';
import { type HomepageOpening } from '@lightdash/common';
import { Box, Button, Group, Popover, Stack, Text } from '@mantine/core';
import {
    IconArrowBackUp,
    IconCheck,
    IconEdit,
    IconLayout,
    IconPlus,
} from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import { useLocalStorage } from 'react-use';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useContentAuthoringEnabled } from '../../../hooks/useContentAuthoringEnabled';
import { Can } from '../../../providers/Ability';
import classes from './adminHomepageControls.module.css';
import { getGreeting } from './greeting';
import {
    useHomepageOpening,
    useOrgHomepageSettings,
    useUpdateOrgHomepageSettings,
} from './hooks/useOrgHomepageSettings';
import { PresetCard } from './TryNewHomepagePromo';

const DEFAULT_NOTICE_STORAGE_KEY = 'homepage-v2-default-notice-closed';

type Props = {
    projectUuid: string;
    organizationUuid: string | undefined;
    showNewHomepage?: boolean;
};

// Org-wide opening choice. Always writes enabled: true because the control is
// only reachable while the new homepage is on; writing the org's current
// (possibly absent) value would create an explicit opt-out row.
const OpeningMenu: FC<{
    projectUuid: string;
    organizationUuid: string | undefined;
}> = ({ projectUuid, organizationUuid }) => {
    const settings = useOrgHomepageSettings();
    const updateSettings = useUpdateOrgHomepageSettings();
    const { opening, canAskAi } = useHomepageOpening(projectUuid);
    const current = settings.data?.opening ?? null;
    const [pickerOpened, setPickerOpened] = useState(false);
    const greeting = getGreeting(undefined);

    // One-time notice for admins whose org landed on the new homepage by
    // default. Every opt-in via the modal picked an explicit opening, so a
    // null opening identifies orgs that never chose.
    const [noticeClosed, setNoticeClosed] = useLocalStorage(
        DEFAULT_NOTICE_STORAGE_KEY,
        false,
    );
    const showNotice =
        !noticeClosed && !!settings.data?.enabled && current === null;
    const closeNotice = () => setNoticeClosed(true);

    const choose = (value: HomepageOpening | null) =>
        updateSettings.mutate({ enabled: true, opening: value });

    return (
        <Can I="manage" this={subject('Organization', { organizationUuid })}>
            <Popover
                opened={showNotice}
                onDismiss={closeNotice}
                position="bottom-end"
                width={300}
                withArrow
            >
                <Popover.Target>
                    <Box>
                        <Popover
                            opened={pickerOpened}
                            onChange={setPickerOpened}
                            position="bottom-end"
                            width={560}
                        >
                            <Popover.Target>
                                <button
                                    type="button"
                                    className={classes.tbBtn}
                                    aria-label="Homepage opening"
                                    aria-expanded={pickerOpened}
                                    onClick={() => setPickerOpened((o) => !o)}
                                >
                                    <MantineIcon icon={IconLayout} size={15} />
                                    <span
                                        className={classes.tbBtnLabel}
                                        aria-hidden="true"
                                    >
                                        Homepage opening
                                    </span>
                                </button>
                            </Popover.Target>
                            <Popover.Dropdown p={14}>
                                <Stack gap="sm">
                                    <Text size="sm" fw={600}>
                                        How every homepage opens
                                    </Text>
                                    <Box
                                        className={classes.pickerCards}
                                        data-disabled={updateSettings.isLoading}
                                    >
                                        <Box
                                            className={classes.pickerCard}
                                            data-unavailable={!canAskAi}
                                        >
                                            <PresetCard
                                                opening="ask-first"
                                                greeting={greeting}
                                                selectable={canAskAi}
                                                selected={
                                                    current === 'ask-first'
                                                }
                                                onSelect={() =>
                                                    choose('ask-first')
                                                }
                                            />
                                            {!canAskAi && (
                                                <Text size="xs" c="dimmed">
                                                    Needs an AI agent in this
                                                    project.
                                                </Text>
                                            )}
                                        </Box>
                                        <Box className={classes.pickerCard}>
                                            <PresetCard
                                                opening="content-first"
                                                greeting={greeting}
                                                selectable
                                                selected={
                                                    current === 'content-first'
                                                }
                                                onSelect={() =>
                                                    choose('content-first')
                                                }
                                            />
                                        </Box>
                                    </Box>
                                    <button
                                        type="button"
                                        className={classes.autoRow}
                                        data-selected={current === null}
                                        disabled={updateSettings.isLoading}
                                        onClick={() => choose(null)}
                                    >
                                        <Box>
                                            <Text size="sm" fw={600}>
                                                Auto
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                Ask first when an AI agent is
                                                available, content first
                                                otherwise.
                                                {current === null &&
                                                    ` Currently ${
                                                        opening === 'ask-first'
                                                            ? 'ask first'
                                                            : 'content first'
                                                    }.`}
                                            </Text>
                                        </Box>
                                        {current === null && (
                                            <MantineIcon
                                                icon={IconCheck}
                                                size={16}
                                            />
                                        )}
                                    </button>
                                </Stack>
                            </Popover.Dropdown>
                        </Popover>
                    </Box>
                </Popover.Target>
                <Popover.Dropdown bg="ldDark.9" c="ldGray.0" p={14}>
                    <Stack gap="sm">
                        <Text fw={600} size="sm">
                            Your homepage has a new look
                        </Text>
                        <Box className={classes.noticePreview}>
                            <PresetCard
                                opening={opening}
                                greeting={greeting}
                                selectable={false}
                                selected={false}
                                onSelect={() => {}}
                            />
                        </Box>
                        <Text size="sm" c="ldGray.3">
                            Everyone in your organization now lands here. Pick
                            how it opens, or switch back to the classic homepage
                            any time.
                        </Text>
                        <Group gap="xs" justify="flex-end">
                            <Button
                                size="xs"
                                variant="subtle"
                                c="ldGray.0"
                                onClick={closeNotice}
                            >
                                Got it
                            </Button>
                            <Button
                                size="xs"
                                variant="white"
                                onClick={() => {
                                    closeNotice();
                                    setPickerOpened(true);
                                }}
                            >
                                Choose opening
                            </Button>
                        </Group>
                    </Stack>
                </Popover.Dropdown>
            </Popover>
        </Can>
    );
};

// Quiet escape hatch: hidden while the settings request is still loading or
// failed, since there is nothing to switch back from.
const SwitchBackButton: FC<{ organizationUuid: string | undefined }> = ({
    organizationUuid,
}) => {
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const settings = useOrgHomepageSettings();
    const updateSettings = useUpdateOrgHomepageSettings();

    if (!settings.data?.enabled) return null;

    return (
        <Can I="manage" this={subject('Organization', { organizationUuid })}>
            <button
                type="button"
                className={classes.tbBtn}
                aria-label="Switch back to classic homepage"
                onClick={() => setIsConfirmOpen(true)}
            >
                <MantineIcon icon={IconArrowBackUp} size={15} />
                <span className={classes.tbBtnLabel} aria-hidden="true">
                    Classic homepage
                </span>
            </button>
            <MantineModal
                opened={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                role="alertdialog"
                title="Switch back to the classic homepage?"
                confirmLabel="Switch back"
                confirmLoading={updateSettings.isLoading}
                onConfirm={() =>
                    updateSettings.mutate(
                        {
                            enabled: false,
                            opening: settings.data?.opening ?? null,
                        },
                        { onSuccess: () => setIsConfirmOpen(false) },
                    )
                }
            >
                <Text size="sm">
                    This turns the new homepage off for every project in your
                    organization. Published homepages are kept, and everything
                    comes back exactly as it was if you turn it on again.
                </Text>
            </MantineModal>
        </Can>
    );
};

// Pinned top-right, just below the navbar, for anyone who can manage the
// project homepage — styled to match the builder's own toolbar buttons.
export const AdminHomepageControls: FC<Props> = ({
    projectUuid,
    organizationUuid,
    showNewHomepage = false,
}) => {
    const navigate = useNavigate();
    const contentAuthoringEnabled = useContentAuthoringEnabled();
    const [isPageScrolled, setIsPageScrolled] = useState(false);

    useEffect(() => {
        const pageRoot = document.getElementById('page-root');
        if (!pageRoot) return;

        const updateScrolledState = () => {
            setIsPageScrolled(pageRoot.scrollTop > 8);
        };

        updateScrolledState();
        pageRoot.addEventListener('scroll', updateScrolledState, {
            passive: true,
        });

        return () =>
            pageRoot.removeEventListener('scroll', updateScrolledState);
    }, []);

    if (!contentAuthoringEnabled) return null;

    return (
        <div className={classes.corner} data-page-scrolled={isPageScrolled}>
            <OpeningMenu
                projectUuid={projectUuid}
                organizationUuid={organizationUuid}
            />
            <SwitchBackButton organizationUuid={organizationUuid} />
            <Can
                I="manage"
                this={subject('ProjectHomepage', {
                    organizationUuid,
                    projectUuid,
                })}
            >
                {showNewHomepage && (
                    <button
                        type="button"
                        className={classes.tbBtn}
                        aria-label="New homepage"
                        onClick={() =>
                            navigate(
                                `/projects/${projectUuid}/homepage-builder?create=1`,
                            )
                        }
                    >
                        <MantineIcon icon={IconPlus} size={15} />
                        <span className={classes.tbBtnLabel} aria-hidden="true">
                            New homepage
                        </span>
                    </button>
                )}
                <button
                    type="button"
                    className={classes.tbBtn}
                    aria-label="Customize homepage"
                    // Anchor for scope walkthroughs (data-tour-via)
                    data-tour-anchor="customize-homepage"
                    data-tour-hint="Click Customize homepage"
                    onClick={() =>
                        navigate(`/projects/${projectUuid}/homepage-builder`)
                    }
                >
                    <MantineIcon icon={IconEdit} size={15} />
                    <span className={classes.tbBtnLabel} aria-hidden="true">
                        Customize homepage
                    </span>
                </button>
            </Can>
        </div>
    );
};
