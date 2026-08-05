import { subject } from '@casl/ability';
import { Text } from '@mantine/core';
import { IconArrowBackUp, IconEdit, IconPlus } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
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

// Quiet escape hatch from the default: homepage v2 is on for every licensed
// org, and this is the only thing that turns it back off.
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
    return (
        <div className={classes.corner}>
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
