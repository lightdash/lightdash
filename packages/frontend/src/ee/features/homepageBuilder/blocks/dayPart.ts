// Late night (before 5am) greets as evening: nobody's morning starts at midnight.
export const dayPart = (hour: number): 'morning' | 'afternoon' | 'evening' => {
    if (hour < 5) return 'evening';
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
};
