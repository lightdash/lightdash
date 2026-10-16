import {
    SlackFeature,
    type SlackFeatureAvailabilityMap,
} from '@lightdash/common';
import { List, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import Callout from '../../common/Callout';

const FEATURE_LABEL_KEYS: Record<SlackFeature, string> = {
    [SlackFeature.SCHEDULED_DELIVERIES]:
        'slackSettingsPanel.missingScopes.features.scheduledDeliveries',
    [SlackFeature.CUSTOM_APP_PROFILE]:
        'slackSettingsPanel.missingScopes.features.customAppProfile',
    [SlackFeature.LINK_UNFURLING]:
        'slackSettingsPanel.missingScopes.features.linkUnfurling',
    [SlackFeature.WRITEBACK_REACTIONS]:
        'slackSettingsPanel.missingScopes.features.writebackReactions',
    [SlackFeature.AI_AGENT]:
        'slackSettingsPanel.missingScopes.features.aiAgent',
};

type Props = {
    features: SlackFeatureAvailabilityMap;
};

export const SlackMissingScopesAlert: FC<Props> = ({ features }) => {
    const { t } = useTranslation('userSettings');
    const unavailable = Object.values(SlackFeature).filter(
        (feature) => !features[feature].available,
    );
    if (unavailable.length === 0) return null;

    return (
        <Callout variant="warning">
            <Text pb="xs">
                {t('slackSettingsPanel.missingScopes.description')}
            </Text>
            <List size="sm">
                {unavailable.map((feature) => (
                    <List.Item key={feature}>
                        <Text span fw={600}>
                            {t(FEATURE_LABEL_KEYS[feature])}
                        </Text>
                        : {features[feature].missingScopes.join(', ')}
                    </List.Item>
                ))}
            </List>
        </Callout>
    );
};
