import { Alert, Button, Stack, Text } from '@mantine/core';
import { IconReportAnalytics } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

/**
 * Builder-side offer for apps built before the AI-analysis SDK surface. The
 * caller gates on availability; an older SDK routes through the app upgrade.
 */
const AddAnalysisOffer: FC<{
    sdkNeedsUpgrade: boolean;
    busy: boolean;
    onAddAnalysis: () => void;
    onUpgradeApp: () => void;
    onDismiss: () => void;
}> = ({ sdkNeedsUpgrade, busy, onAddAnalysis, onUpgradeApp, onDismiss }) => (
    <Alert
        variant="outline"
        color="blue"
        icon={<MantineIcon icon={IconReportAnalytics} />}
        title="AI analysis is available"
        withCloseButton
        closeButtonLabel="Dismiss"
        onClose={onDismiss}
        mb="xs"
        data-testid="add-analysis-offer"
    >
        <Stack gap="xs" align="flex-start">
            <Text size="sm">
                {sdkNeedsUpgrade
                    ? 'Upgrade the app first, then add an AI summary and highlights on unusual values.'
                    : 'Give viewers an AI summary and highlights on unusual values.'}
            </Text>
            <Button
                size="compact-xs"
                variant="default"
                disabled={busy}
                onClick={sdkNeedsUpgrade ? onUpgradeApp : onAddAnalysis}
            >
                {sdkNeedsUpgrade ? 'Upgrade app' : 'Add AI analysis'}
            </Button>
        </Stack>
    </Alert>
);

export default AddAnalysisOffer;
