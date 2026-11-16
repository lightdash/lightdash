import { Box, Paper, Text, Title } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { IconCircleCheck } from '@tabler/icons-react';
import { useEffect, useState, type ReactNode } from 'react';
import MantineIcon from '../components/common/MantineIcon';
import popoverClasses from '../features/mobile/MobileSettingsPage.module.css';
import {
    MOBILE_SIGN_IN_STRINGS,
    MOBILE_STRINGS,
} from '../features/mobile/mobileStrings';
import { PreviewQrPattern } from '../features/mobile/PreviewQrPattern';
import classes from '../features/mobile/upsell/MobileUpsell.module.css';
import { MobileUpsellFrame } from '../features/mobile/upsell/MobileUpsellFrame';
import { PlatformsUpsell } from '../features/mobile/upsell/PlatformsUpsell';
import { Phone } from '../features/mobile/upsell/UpsellParts';
import { UPSELL_STRINGS } from '../features/mobile/upsell/upsellStrings';

const STEPS = MOBILE_SIGN_IN_STRINGS.rescanSteps;
const PITCH = UPSELL_STRINGS[6];

const PROTOTYPE_STRINGS = {
    camera: 'Camera',
    store: 'Lightdash',
    get: 'Get',
    hint: 'No app? Scan, install it, then scan this code again.',
} as const;

type Props = { width: number; step?: 0 | 1 | 2 };

const PopoverShell = ({
    width,
    children,
}: {
    width: number;
    children: ReactNode;
}) => (
    <Paper
        className={popoverClasses.signInPopover}
        w={width}
        p="sm"
        data-testid="popover"
    >
        {children}
    </Paper>
);

const Qr = () => (
    <Box className={popoverClasses.qrFrame}>
        <PreviewQrPattern />
    </Box>
);

const SignInTitle = () => <Title order={6}>{MOBILE_STRINGS.signInTitle}</Title>;

const PrototypeFrame = ({
    stage,
    underQr,
}: {
    stage: ReactNode;
    underQr?: ReactNode;
}) => (
    <div className={classes.frame} data-mobile-upsell={6}>
        <div className={classes.pitch}>
            <Title order={3} className={classes.headline}>
                {PITCH.headline}
            </Title>
            <Text size="sm" className={classes.support}>
                {PITCH.support}
            </Text>
        </div>
        <div className={classes.signIn}>
            <div className={classes.signInTitle}>
                <SignInTitle />
            </div>
            <div className={classes.panel} data-step-active={false}>
                <div className={classes.qrColumn}>
                    <Qr />
                    {underQr}
                </div>
                <div className={classes.side} data-idle>
                    <div className={classes.stage} aria-hidden="true">
                        {stage}
                    </div>
                </div>
            </div>
        </div>
    </div>
);

const QR_CELLS = Array.from({ length: 25 }, (_, index) => ({
    key: index,
    x: (index % 5) * 10,
    y: Math.floor(index / 5) * 10,
    isLit: (index * 37) % 5 < 2,
}));

const MiniQr = () => (
    <svg viewBox="0 0 48 48" width={72} height={72}>
        {QR_CELLS.map(({ key, x, y, isLit }) => (
            <rect
                key={key}
                x={x}
                y={y}
                width={8}
                height={8}
                fill={isLit ? 'var(--ld-violet-soft)' : 'var(--ld-guide)'}
            />
        ))}
    </svg>
);

const PHONE_SCREENS = [
    {
        caption: STEPS.scan,
        screen: (
            <>
                <div className={classes.screenTitle}>
                    {PROTOTYPE_STRINGS.camera}
                </div>
                <div className={classes.tile}>
                    <MiniQr />
                </div>
            </>
        ),
    },
    {
        caption: STEPS.install,
        screen: (
            <>
                <div className={classes.screenTitle}>
                    {PROTOTYPE_STRINGS.store}
                </div>
                <div className={classes.answer}>
                    <span>{PROTOTYPE_STRINGS.store}</span>
                    <div className={classes.bubble}>
                        {PROTOTYPE_STRINGS.get}
                    </div>
                </div>
            </>
        ),
    },
    {
        caption: STEPS.scanAgain,
        screen: (
            <>
                <div className={classes.screenTitle}>
                    {PROTOTYPE_STRINGS.camera}
                </div>
                <div className={classes.tile}>
                    <MiniQr />
                    <MantineIcon icon={IconCircleCheck} size={24} />
                </div>
            </>
        ),
    },
];

const useLoopingStep = (pinned: number | undefined) => {
    const [step, setStep] = useState(0);
    useEffect(() => {
        if (pinned !== undefined) return undefined;
        const timer = window.setInterval(
            () => setStep((current) => (current + 1) % PHONE_SCREENS.length),
            2000,
        );
        return () => window.clearInterval(timer);
    }, [pinned]);
    return pinned ?? step;
};

const PhoneWalksTheSteps = ({ width, step }: Props) => {
    const current = PHONE_SCREENS[useLoopingStep(step)];
    return (
        <PopoverShell width={width}>
            <PrototypeFrame
                stage={
                    <>
                        <div
                            className={`${classes.scene} ${classes.homeScene}`}
                        >
                            <Phone className={classes.homePhone}>
                                {current.screen}
                            </Phone>
                        </div>
                        <Text
                            pos="absolute"
                            bottom={0}
                            left={0}
                            right={0}
                            py="xs"
                            bg="black"
                            fz="xs"
                            ta="center"
                            c="white"
                        >
                            {current.caption}
                        </Text>
                    </>
                }
            />
        </PopoverShell>
    );
};

const OneLineHint = ({ width }: Props) => (
    <PopoverShell width={width}>
        <PrototypeFrame
            stage={<PlatformsUpsell />}
            underQr={
                <Text fz="xs" c="dimmed">
                    {PROTOTYPE_STRINGS.hint}
                </Text>
            }
        />
    </PopoverShell>
);

const StepStrip = ({ width }: Props) => (
    <PopoverShell width={width}>
        <MobileUpsellFrame
            variation={6}
            isIdle
            isSignedIn={false}
            title={<SignInTitle />}
            step={null}
            qr={<Qr />}
            details={null}
            status={null}
        />
    </PopoverShell>
);

const meta: Meta<Props> = {
    title: 'Mobile/Sign-in rescan options',
    args: { width: 508 },
    decorators: [
        (renderStory) => (
            <Box p="md" mt="xl">
                {renderStory()}
            </Box>
        ),
    ],
};

export default meta;

type Story = StoryObj<Props>;

export const BStepStripImplemented: Story = {
    name: 'B: Step strip (implemented)',
    render: StepStrip,
};

export const BStepStripNarrowImplemented: Story = {
    name: 'B: Step strip, narrow (implemented)',
    args: { width: 360 },
    render: StepStrip,
};

export const APhoneWalksTheStepsPrototype: Story = {
    name: 'A: Phone walks the steps (prototype)',
    render: PhoneWalksTheSteps,
};

export const APhoneWalksTheStepsStorePrototype: Story = {
    name: 'A: Phone walks the steps, store screen (prototype)',
    args: { step: 1 },
    render: PhoneWalksTheSteps,
};

export const COneLineHintPrototype: Story = {
    name: 'C: One-line hint (prototype)',
    render: OneLineHint,
};
