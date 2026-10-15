import { subject } from '@casl/ability';
import { type HomepageOpening } from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    CloseButton,
    Group,
    Stack,
    Text,
} from '@mantine/core';
import {
    IconCheck,
    IconHome,
    IconLayoutGrid,
    IconLink,
    IconSpeakerphone,
    IconUsersGroup,
} from '@tabler/icons-react';
import { useEffect, useRef, useState, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useLocalStorage } from 'react-use';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { getDefaultGreetingSubtitle, getGreeting } from './greeting';
import { useHomepageAiState } from './hooks/useHomepageAiState';
import { useUpdateOrgHomepageSettings } from './hooks/useOrgHomepageSettings';
import classes from './TryNewHomepagePromo.module.css';

/** Miniature of the page each opening produces, in the gallery-card language:
 * mock content above, name below. The choice step doubles as the gallery. */
const PresetCard: FC<{
    opening: HomepageOpening;
    greeting: string;
    // Without AI there is no alternative, so the single preview renders as a
    // plain illustration rather than a pressable "choice".
    selectable: boolean;
    selected: boolean;
    onSelect: () => void;
}> = ({ opening, greeting, selectable, selected, onSelect }) => {
    const { t } = useTranslation('homepageBuilder');
    return (
        <button
            type="button"
            className={classes.presetCard}
            data-selected={selectable && selected}
            data-static={!selectable}
            onClick={selectable ? onSelect : undefined}
            aria-pressed={selectable ? selected : undefined}
        >
            <div className={classes.presetMock}>
                <span className={classes.mockGreeting}>{greeting}</span>
                {opening === 'ask-first' ? (
                    <>
                        <span className={classes.mockSub}>
                            {t('promo.mock.askSubtitle')}
                        </span>
                        <span className={classes.mockComposer}>
                            {t('promo.mock.composerPlaceholder')}
                            <span className={classes.mockComposerArrow}>↑</span>
                        </span>
                    </>
                ) : (
                    <>
                        <span className={classes.mockSub}>
                            {getDefaultGreetingSubtitle()}
                        </span>
                        <span className={classes.mockChips}>
                            <span className={classes.mockChip}>
                                <span className={classes.mockChipDot} />
                                {t('promo.mock.runQuery')}
                            </span>
                            <span className={classes.mockChip}>
                                <span className={classes.mockChipDot} />
                                {t('promo.mock.dashboards')}
                            </span>
                            <span className={classes.mockChip}>
                                <span className={classes.mockChipDot} />
                                {t('promo.mock.spaces')}
                            </span>
                        </span>
                    </>
                )}
                <span className={classes.mockCards}>
                    {[0, 1, 2].map((i) => (
                        <span key={i} className={classes.mockCard}>
                            <span className={classes.mockCardIcon} />
                            <span className={classes.mockCardLine} />
                            <span
                                className={classes.mockCardLine}
                                data-short="true"
                            />
                        </span>
                    ))}
                </span>
            </div>
            <div className={classes.presetMeta}>
                <Box>
                    <Text size="sm" fw={600}>
                        {opening === 'ask-first'
                            ? t('promo.presets.askFirst.title')
                            : selectable
                              ? t('promo.presets.contentFirst.title')
                              : t('promo.presets.yourHomepage.title')}
                    </Text>
                    <Text size="xs" c="dimmed">
                        {opening === 'ask-first'
                            ? t('promo.presets.askFirst.description')
                            : selectable
                              ? t('promo.presets.contentFirst.description')
                              : t('promo.presets.yourHomepage.description')}
                    </Text>
                </Box>
                {selectable && (
                    <span className={classes.presetCheck}>
                        <MantineIcon icon={IconCheck} size={12} />
                    </span>
                )}
            </div>
        </button>
    );
};

// The sell: what admins can actually build, not just how the page opens.
const FEATURE_HIGHLIGHTS = [
    { key: 'collections', icon: IconLayoutGrid },
    { key: 'announcements', icon: IconSpeakerphone },
    { key: 'resources', icon: IconLink },
    { key: 'audiences', icon: IconUsersGroup },
];

export const TryNewHomepageModal: FC<{
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
}> = ({ opened, onClose, projectUuid }) => {
    const { t } = useTranslation('homepageBuilder');
    const navigate = useNavigate();
    const { user } = useApp();
    const { canAskAi } = useHomepageAiState(projectUuid);
    const { track } = useTracking();
    const [opening, setOpening] = useState<HomepageOpening>('ask-first');
    const [isLive, setIsLive] = useState(false);
    // Applying on success flips the homepage immediately, so the success
    // screen shows over the page it is describing. This modal must therefore
    // be mounted at page level (outside the homepage branch), or the flip
    // would unmount it mid-flow.
    const updateSettings = useUpdateOrgHomepageSettings();

    const greeting = getGreeting(user.data?.firstName);
    // Without a working composer there's no fork to offer — content-first is
    // simply what the homepage is, not a degraded choice.
    const showChoice = canAskAi;

    const handleTurnOn = () => {
        const chosenOpening = showChoice ? opening : 'content-first';
        updateSettings.mutate(
            { enabled: true, opening: chosenOpening },
            {
                onSuccess: (settings) => {
                    setIsLive(true);
                    track({
                        name: EventName.HOMEPAGE_V2_OPTED_IN,
                        properties: {
                            organizationUuid: settings.organizationUuid,
                            opening: chosenOpening,
                            canAskAi,
                        },
                    });
                },
            },
        );
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            size={720}
            title={isLive ? t('promo.modal.liveTitle') : t('promo.modal.title')}
            subtitle={
                isLive
                    ? t('promo.modal.liveSubtitle')
                    : t('promo.modal.subtitle')
            }
            icon={IconHome}
            modalBodyProps={{ px: 0, py: 0 }}
            cancelLabel={
                isLive ? t('promo.modal.done') : t('promo.modal.notNow')
            }
            confirmLabel={
                isLive ? t('promo.modal.customize') : t('promo.modal.turnOn')
            }
            confirmLoading={updateSettings.isLoading}
            onConfirm={
                isLive
                    ? () =>
                          navigate(`/projects/${projectUuid}/homepage-builder`)
                    : handleTurnOn
            }
        >
            <div className={classes.hero}>
                {isLive ? (
                    <Stack align="center" gap={14}>
                        <Text fw={600}>{t('promo.modal.whatTeamSees')}</Text>
                        <div className={classes.heroCards}>
                            <PresetCard
                                opening={showChoice ? opening : 'content-first'}
                                greeting={greeting}
                                selectable={false}
                                selected={false}
                                onSelect={() => {}}
                            />
                        </div>
                        <Text size="sm" c="dimmed" ta="center" maw={420}>
                            {opening === 'ask-first' && showChoice
                                ? t('promo.modal.opensOnAsk')
                                : t('promo.modal.opensOnContent')}
                        </Text>
                    </Stack>
                ) : (
                    <Stack gap={14}>
                        <Text size="sm" fw={500} ta="center">
                            {showChoice
                                ? t('promo.modal.pickHowItOpens')
                                : t('promo.modal.couldLookLike')}
                        </Text>
                        <div className={classes.heroCards}>
                            {showChoice && (
                                <PresetCard
                                    opening="ask-first"
                                    greeting={greeting}
                                    selectable
                                    selected={opening === 'ask-first'}
                                    onSelect={() => setOpening('ask-first')}
                                />
                            )}
                            <PresetCard
                                opening="content-first"
                                greeting={greeting}
                                selectable={showChoice}
                                selected={opening === 'content-first'}
                                onSelect={() => setOpening('content-first')}
                            />
                        </div>
                        <Text size="xs" c="dimmed" ta="center">
                            <Trans
                                t={t}
                                i18nKey="promo.modal.turnsOnFor"
                                components={{
                                    strong: <Text span size="xs" fw={600} />,
                                }}
                            />
                        </Text>
                    </Stack>
                )}
            </div>
            {!isLive && (
                <div className={classes.features}>
                    {FEATURE_HIGHLIGHTS.map((feature) => (
                        <div key={feature.key} className={classes.featureItem}>
                            <span className={classes.featureIcon}>
                                <MantineIcon icon={feature.icon} size={15} />
                            </span>
                            <Box>
                                <Text size="sm" fw={600}>
                                    {t(`promo.features.${feature.key}.label`)}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {t(
                                        `promo.features.${feature.key}.description`,
                                    )}
                                </Text>
                            </Box>
                        </div>
                    ))}
                </div>
            )}
        </MantineModal>
    );
};

/** Dismissible invitation on the classic homepage, shown only to org admins —
 * the one role that can complete the org-wide opt-in. The modal itself lives
 * at page level (it must survive the homepage flip), so opening it is the
 * parent's job. */
export const TryNewHomepageCard: FC<{
    organizationUuid: string | undefined;
    onTryNow: () => void;
}> = ({ organizationUuid, onTryNow }) => {
    const { t } = useTranslation('homepageBuilder');
    const { user, health } = useApp();
    const { track } = useTracking();
    const [dismissed, setDismissed] = useLocalStorage(
        `homepage-v2-promo-dismissed-${user.data?.userUuid ?? 'anon'}`,
        false,
    );

    const isOrgAdmin =
        user.data?.ability?.can(
            'manage',
            subject('Organization', { organizationUuid }),
        ) ?? false;

    // The homepage builder is an enterprise feature: unlicensed self-hosted
    // instances have no backing service, so never invite them to try it.
    const hasValidLicense = !!health.data?.license?.valid;

    const isVisible = !dismissed && isOrgAdmin && hasValidLicense;

    // Once per mount, not per render: seeing the card is the top of the
    // opt-in funnel.
    const hasTrackedView = useRef(false);
    useEffect(() => {
        if (!isVisible || hasTrackedView.current || !organizationUuid) return;
        hasTrackedView.current = true;
        track({
            name: EventName.HOMEPAGE_V2_PROMO_VIEWED,
            properties: { organizationUuid },
        });
    }, [isVisible, organizationUuid, track]);

    // The new homepage has no mobile experience yet, so don't invite mobile
    // users into it.
    if (!isVisible) return null;

    return (
        <div className={classes.promoCard}>
            <div className={classes.promoInner}>
                <span className={classes.promoIcon}>
                    <MantineIcon icon={IconHome} size={18} />
                </span>
                <div className={classes.promoCopy}>
                    <Group gap={6}>
                        <Text size="sm" fw={600}>
                            {t('promo.card.title')}
                        </Text>
                        <Badge size="xs" variant="filled" color="dark">
                            {t('promo.card.new')}
                        </Badge>
                    </Group>
                    <Text size="xs" c="dimmed">
                        {t('promo.card.description')}
                    </Text>
                </div>
                <Button variant="default" size="xs" onClick={onTryNow}>
                    {t('promo.card.tryNow')}
                </Button>
                <CloseButton
                    size="sm"
                    aria-label={t('promo.card.dismiss')}
                    onClick={() => {
                        setDismissed(true);
                        if (organizationUuid) {
                            track({
                                name: EventName.HOMEPAGE_V2_PROMO_DISMISSED,
                                properties: { organizationUuid },
                            });
                        }
                    }}
                />
            </div>
        </div>
    );
};
