import { subject } from '@casl/ability';
import { Text } from '@mantine/core';
import { IconArrowBackUp, IconEdit, IconPlus } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
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

// Quiet escape hatch for the opt-in flow: only offered when the org enabled
// homepage v2 via settings (flag-enabled orgs have no settings row to unset).
const SwitchBackButton: FC<{ organizationUuid: string | undefined }> = ({
    organizationUuid,
}) => {
    const { t } = useTranslation('homepageBuilder');
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const settings = useOrgHomepageSettings();
    const updateSettings = useUpdateOrgHomepageSettings();

    if (!settings.data?.enabled) return null;

    return (
        <Can I="manage" this={subject('Organization', { organizationUuid })}>
            <button
                type="button"
                className={classes.tbBtn}
                aria-label={t('adminControls.switchBack.ariaLabel')}
                onClick={() => setIsConfirmOpen(true)}
            >
                <MantineIcon icon={IconArrowBackUp} size={15} />
                <span className={classes.tbBtnLabel} aria-hidden="true">
                    {t('adminControls.switchBack.label')}
                </span>
            </button>
            <MantineModal
                opened={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                role="alertdialog"
                title={t('adminControls.switchBack.title')}
                confirmLabel={t('adminControls.switchBack.confirm')}
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
                    {t('adminControls.switchBack.description')}
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
    const { t } = useTranslation('homepageBuilder');
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
                        aria-label={t('adminControls.newHomepage')}
                        onClick={() =>
                            navigate(
                                `/projects/${projectUuid}/homepage-builder?create=1`,
                            )
                        }
                    >
                        <MantineIcon icon={IconPlus} size={15} />
                        <span className={classes.tbBtnLabel} aria-hidden="true">
                            {t('adminControls.newHomepage')}
                        </span>
                    </button>
                )}
                <button
                    type="button"
                    className={classes.tbBtn}
                    aria-label={t('adminControls.customize')}
                    // Anchor for scope walkthroughs (data-tour-via)
                    data-tour-anchor="customize-homepage"
                    data-tour-hint="Click Customize homepage"
                    onClick={() =>
                        navigate(`/projects/${projectUuid}/homepage-builder`)
                    }
                >
                    <MantineIcon icon={IconEdit} size={15} />
                    <span className={classes.tbBtnLabel} aria-hidden="true">
                        {t('adminControls.customize')}
                    </span>
                </button>
            </Can>
        </div>
    );
};
