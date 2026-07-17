import { dayPart } from './blocks/dayPart';

export const getGreeting = (firstName: string | undefined): string => {
    const name = firstName?.trim();
    return `Good ${dayPart(new Date().getHours())}${name ? `, ${name}` : ''}`;
};
