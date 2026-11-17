import { Button, CloseButton, Group, Text } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './AddAnalysisOffer.module.css';

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
    <Group
        className={classes.offer}
        gap="xs"
        wrap="nowrap"
        data-testid="add-analysis-offer"
    >
        <MantineIcon icon={IconSparkles} size={14} className={classes.icon} />
        <Text size="xs" c="dimmed" flex={1} miw={0}>
            {sdkNeedsUpgrade
                ? 'Upgrade this app to give viewers an AI summary and anomaly highlights.'
                : 'Give viewers an AI summary and anomaly highlights.'}
        </Text>
        <Button
            size="compact-xs"
            variant="default"
            disabled={busy}
            onClick={sdkNeedsUpgrade ? onUpgradeApp : onAddAnalysis}
        >
            {sdkNeedsUpgrade ? 'Upgrade app' : 'Add AI analysis'}
        </Button>
        <CloseButton size="sm" aria-label="Dismiss" onClick={onDismiss} />
    </Group>
);

export default AddAnalysisOffer;
