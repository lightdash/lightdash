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
} from '@mantine-8/core';
import {
    IconCheck,
    IconHome,
    IconLayoutGrid,
    IconLink,
    IconSpeakerphone,
    IconUsersGroup,
} from '@tabler/icons-react';
import { useEffect, useRef, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import { useLocalStorage } from 'react-use';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { IS_MOBILE } from '../../../utils/isMobile';
import { DEFAULT_GREETING_SUBTITLE, getGreeting } from './greeting';
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
}> = ({ opening, greeting, selectable, selected, onSelect }) => (
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
                        What do you want to know?
                    </span>
                    <span className={classes.mockComposer}>
                        Ask anything about your data…
                        <span className={classes.mockComposerArrow}>↑</span>
                    </span>
                </>
            ) : (
                <>
                    <span className={classes.mockSub}>
                        {DEFAULT_GREETING_SUBTITLE}
                    </span>
                    <span className={classes.mockChips}>
                        <span className={classes.mockChip}>
                            <span className={classes.mockChipDot} />
                            Run a query
                        </span>
                        <span className={classes.mockChip}>
                            <span className={classes.mockChipDot} />
                            Dashboards
                        </span>
                        <span className={classes.mockChip}>
                            <span className={classes.mockChipDot} />
                            Spaces
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
                        ? 'Ask first'
                        : selectable
                          ? 'Content first'
                          : 'Your homepage'}
                </Text>
                <Text size="xs" c="dimmed">
                    {opening === 'ask-first'
                        ? 'Opens on the Ask AI composer, curated content below.'
                        : selectable
                          ? 'Opens on your content; Ask AI stays a quick action.'
                          : 'Opens on your content: quick actions, spaces, and recent items.'}
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

// The sell: what admins can actually build, not just how the page opens.
const FEATURE_HIGHLIGHTS = [
    {
        icon: IconLayoutGrid,
        label: 'Collections',
        description:
            'Curate charts, dashboards, and spaces, or keep them live from most viewed and pinned.',
    },
    {
        icon: IconSpeakerphone,
        label: 'Data announcements',
        description:
            'Post releases, incidents, and schema changes right on the front page.',
    },
    {
        icon: IconLink,
        label: 'Resources',
        description:
            'Link runbooks, videos, docs, and tools from anywhere on the web.',
    },
    {
        icon: IconUsersGroup,
        label: 'Audiences',
        description:
            'Publish different homepages to different groups and roles.',
    },
];

export const TryNewHomepageModal: FC<{
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
}> = ({ opened, onClose, projectUuid }) => {
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
            title={
                isLive ? 'Your new homepage is live' : 'Meet the new Homepage'
            }
            subtitle={
                isLive
                    ? 'Everyone in your organization now lands on it.'
                    : 'Composable blocks, curated collections, and announcements, published to your whole team.'
            }
            icon={IconHome}
            modalBodyProps={{ px: 0, py: 0 }}
            cancelLabel={isLive ? 'Done' : 'Not now'}
            confirmLabel={isLive ? 'Customize it' : 'Turn on for all projects'}
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
                        <Text fw={600}>This is what your team sees now.</Text>
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
                            Every project now opens{' '}
                            {opening === 'ask-first' && showChoice
                                ? 'on the Ask AI composer'
                                : 'on its content'}
                            . You can customize each project's homepage, or swap
                            its opening, from the builder.
                        </Text>
                    </Stack>
                ) : (
                    <Stack gap={14}>
                        <Text size="sm" fw={500} ta="center">
                            {showChoice
                                ? 'Pick how it opens. This is what it could look like'
                                : 'This is what it could look like'}
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
                            Turns on the new homepage for{' '}
                            <Text span size="xs" fw={600}>
                                all projects in your organization
                            </Text>
                            . You can switch back any time.
                        </Text>
                    </Stack>
                )}
            </div>
            {!isLive && (
                <div className={classes.features}>
                    {FEATURE_HIGHLIGHTS.map((feature) => (
                        <div
                            key={feature.label}
                            className={classes.featureItem}
                        >
                            <span className={classes.featureIcon}>
                                <MantineIcon icon={feature.icon} size={15} />
                            </span>
                            <Box>
                                <Text size="sm" fw={600}>
                                    {feature.label}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {feature.description}
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

    const isVisible = !IS_MOBILE && !dismissed && isOrgAdmin && hasValidLicense;

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
                            A new Homepage is here
                        </Text>
                        <Badge size="xs" variant="filled" color="dark">
                            New
                        </Badge>
                    </Group>
                    <Text size="xs" c="dimmed">
                        A curated start page for your whole team, with blocks,
                        collections, and announcements you compose.
                    </Text>
                </div>
                <Button variant="default" size="xs" onClick={onTryNow}>
                    Try it now!
                </Button>
                <CloseButton
                    size="sm"
                    aria-label="Dismiss"
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
