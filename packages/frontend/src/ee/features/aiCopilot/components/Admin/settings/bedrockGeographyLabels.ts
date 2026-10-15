import { type BedrockInferenceGeography } from '@lightdash/common';
import i18n from '../../../../../../i18n/i18n';

export const BEDROCK_GEOGRAPHY_LABELS: Record<
    BedrockInferenceGeography,
    string
> = {
    get jp() {
        return i18n.t('settings.geography.jp', { ns: 'aiCopilotAdmin' });
    },
    get us() {
        return i18n.t('settings.geography.us', { ns: 'aiCopilotAdmin' });
    },
    get eu() {
        return i18n.t('settings.geography.eu', { ns: 'aiCopilotAdmin' });
    },
    get apac() {
        return i18n.t('settings.geography.apac', { ns: 'aiCopilotAdmin' });
    },
    get global() {
        return i18n.t('settings.geography.global', { ns: 'aiCopilotAdmin' });
    },
};
