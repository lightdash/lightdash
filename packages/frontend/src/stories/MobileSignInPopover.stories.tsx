import { Box, Paper, Title } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import popoverClasses from '../features/mobile/MobileSettingsPage.module.css';
import { MOBILE_STRINGS } from '../features/mobile/mobileStrings';
import { PreviewQrPattern } from '../features/mobile/PreviewQrPattern';
import { MobileUpsellFrame } from '../features/mobile/upsell/MobileUpsellFrame';

type Props = { width: number };

const WaitingForScan = ({ width }: Props) => (
    <Paper
        className={popoverClasses.signInPopover}
        w={width}
        p="sm"
        data-testid="popover"
    >
        <MobileUpsellFrame
            variation={6}
            isIdle
            isWaitingForScan
            isSignedIn={false}
            title={<Title order={6}>{MOBILE_STRINGS.signInTitle}</Title>}
            step={null}
            qr={
                <Box className={popoverClasses.qrFrame}>
                    <PreviewQrPattern />
                </Box>
            }
            details={null}
            status={null}
        />
    </Paper>
);

const meta: Meta<Props> = {
    title: 'Mobile/Sign-in popover',
    args: { width: 508 },
    render: WaitingForScan,
    decorators: [
        (renderStory) => (
            <Box p="md" mt="xl">
                {renderStory()}
            </Box>
        ),
    ],
};

export default meta;

export const Waiting: StoryObj<Props> = {
    name: 'Waiting for scan',
};
