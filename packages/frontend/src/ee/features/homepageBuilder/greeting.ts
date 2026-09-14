import { HOMEPAGE_DEFAULT_GREETING_SUBTITLE } from '@lightdash/common';
import { dayPart } from './blocks/dayPart';

export const DEFAULT_GREETING_SUBTITLE = HOMEPAGE_DEFAULT_GREETING_SUBTITLE;

export const getGreeting = (firstName: string | undefined): string => {
    const name = firstName?.trim();
    return `Good ${dayPart(new Date().getHours())}${name ? `, ${name}` : ''}`;
};
