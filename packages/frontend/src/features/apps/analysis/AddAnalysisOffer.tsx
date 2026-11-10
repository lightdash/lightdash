import { Button, Group, Text } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { type FC } from 'react';
import Callout from '../../../components/common/Callout';
import MantineIcon from '../../../components/common/MantineIcon';

/**
 * Builder-side offer for apps built before the AI-analysis SDK surface:
 * one click asks the build agent for the default analysis build. Rendered
 * only when analysis is actually available to the org — availability gating
 * is the caller's job. On an older SDK the shipped insight components are
 * missing from the sandbox, so the offer routes through the app upgrade
 * first; the rebuilt version then re-offers the analysis step itself.
 */
const AddAnalysisOffer: FC<{
    sdkNeedsUpgrade: boolean;
    busy: boolean;
    onAddAnalysis: () => void;
    onUpgradeApp: () => void;
    onDismiss: () => void;
}> = ({ sdkNeedsUpgrade, busy, onAddAnalysis, onUpgradeApp, onDismiss }) => (
    <Callout
        variant="info"
        icon={<MantineIcon icon={IconSparkles} />}
        title="This app doesn't surface AI analysis yet"
        withCloseButton
        closeButtonLabel="Dismiss"
        onClose={onDismiss}
        mb="xs"
        data-testid="add-analysis-offer"
    >
        <Group justify="space-between" align="flex-end" gap="xs">
            <Text size="sm" flex={1} miw={200}>
                {sdkNeedsUpgrade
                    ? 'The build agent can add an executive summary and anomaly markers to this app. It was built before those components shipped, so upgrade the app first.'
                    : 'The build agent can add the default analysis surface: an executive summary, anomaly markers on charts and Investigate in data-point menus.'}
            </Text>
            {sdkNeedsUpgrade ? (
                <Button size="xs" disabled={busy} onClick={onUpgradeApp}>
                    Upgrade app
                </Button>
            ) : (
                <Button size="xs" disabled={busy} onClick={onAddAnalysis}>
                    Add AI analysis
                </Button>
            )}
        </Group>
    </Callout>
);

export default AddAnalysisOffer;
