import i18n from '../../../i18n/i18n';
import { dayPart } from './blocks/dayPart';

export const getDefaultGreetingSubtitle = (): string =>
    i18n.t('greeting.defaultSubtitle', { ns: 'homepageBuilder' });

export const getGreeting = (firstName: string | undefined): string => {
    const name = firstName?.trim();
    const part = dayPart(new Date().getHours());
    return name
        ? i18n.t(`greeting.${part}WithName`, { ns: 'homepageBuilder', name })
        : i18n.t(`greeting.${part}`, { ns: 'homepageBuilder' });
};
