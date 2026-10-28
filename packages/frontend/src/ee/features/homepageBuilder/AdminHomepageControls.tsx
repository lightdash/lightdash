import { subject } from '@casl/ability';
import { type HomepageOpening } from '@lightdash/common';
import { Menu, Text } from '@mantine/core';
import {
    IconArrowBackUp,
    IconCheck,
    IconEdit,
    IconLayout,
    IconPlus,
} from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useContentAuthoringEnabled } from '../../../hooks/useContentAuthoringEnabled';
import { Can } from '../../../providers/Ability';
import classes from './adminHomepageControls.module.css';
import {
    useOrgHomepageSettings,
    useUpdateOrgHomepageSettings,
} from './hooks/useOrgHomepageSettings';

type Props = {
    projectUuid: string;
    organizationUuid: string | undefined;
    showNewHomepage?: boolean;
};

const OPENING_OPTIONS: {
    value: HomepageOpening | null;
    label: string;
    description: string;
}[] = [
    {
        value: 'ask-first',
        label: 'Ask first',
        description: 'Opens on the Ask AI composer',
    },
    {
        value: 'content-first',
        label: 'Content first',
        description: 'Opens on your content',
    },
    {
        value: null,
        label: 'Auto',
        description: 'Ask first when AI is available',
    },
];

// Org-wide opening choice. Always writes enabled: true because the control is
// only reachable while the new homepage is on; writing the org's current
// (possibly absent) value would create an explicit opt-out row.
const OpeningMenu: FC<{ organizationUuid: string | undefined }> = ({
    organizationUuid,
}) => {
    const settings = useOrgHomepageSettings();
    const updateSettings = useUpdateOrgHomepageSettings();
    const current = settings.data?.opening ?? null;

    return (
        <Can I="manage" this={subject('Organization', { organizationUuid })}>
            <Menu position="bottom-end" width={240}>
                <Menu.Target>
                    <button
                        type="button"
                        className={classes.tbBtn}
                        aria-label="Homepage opening"
                    >
                        <MantineIcon icon={IconLayout} size={15} />
                        <span className={classes.tbBtnLabel} aria-hidden="true">
                            Homepage opening
                        </span>
                    </button>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Label>How every homepage opens</Menu.Label>
                    {OPENING_OPTIONS.map((option) => (
                        <Menu.Item
                            key={option.label}
                            disabled={updateSettings.isLoading}
                            rightSection={
                                option.value === current ? (
                                    <MantineIcon icon={IconCheck} size={14} />
                                ) : null
                            }
                            onClick={() =>
                                updateSettings.mutate({
                                    enabled: true,
                                    opening: option.value,
                                })
                            }
                        >
                            <Text size="sm">{option.label}</Text>
                            <Text size="xs" c="dimmed">
                                {option.description}
                            </Text>
                        </Menu.Item>
                    ))}
                </Menu.Dropdown>
            </Menu>
        </Can>
    );
};

// Quiet escape hatch for the opt-in flow: only offered when the org enabled
// homepage v2 via settings (flag-enabled orgs have no settings row to unset).
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
            <OpeningMenu organizationUuid={organizationUuid} />
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
