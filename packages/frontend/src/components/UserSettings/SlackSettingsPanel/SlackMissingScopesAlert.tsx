import {
    SlackFeature,
    type SlackFeatureAvailabilityMap,
} from '@lightdash/common';
import { Alert, List, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

const FEATURE_LABELS: Record<SlackFeature, string> = {
    [SlackFeature.SCHEDULED_DELIVERIES]: 'Scheduled deliveries',
    [SlackFeature.CUSTOM_APP_PROFILE]: 'Custom app profile photo',
    [SlackFeature.LINK_UNFURLING]: 'Link previews',
    [SlackFeature.WRITEBACK_REACTIONS]: 'Writeback confirmations',
    [SlackFeature.AI_AGENT]: 'AI agents',
};

type Props = {
    features: SlackFeatureAvailabilityMap;
};

export const SlackMissingScopesAlert: FC<Props> = ({ features }) => {
    const unavailable = Object.values(SlackFeature).filter(
        (feature) => !features[feature].available,
    );
    if (unavailable.length === 0) return null;

    return (
        <Alert color="orange" icon={<MantineIcon icon={IconAlertCircle} />}>
            <Text pb="xs">
                The installed Slack app is missing scopes for some features.
                Reinstall the Slack integration to grant them.
            </Text>
            <List size="sm">
                {unavailable.map((feature) => (
                    <List.Item key={feature}>
                        <Text span fw={600}>
                            {FEATURE_LABELS[feature]}
                        </Text>
                        : {features[feature].missingScopes.join(', ')}
                    </List.Item>
                ))}
            </List>
        </Alert>
    );
};
