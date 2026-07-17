import type { TerminalTheme } from '../components/ui/types';

export const defaultTheme: TerminalTheme = {
    name: 'lightdash',
    colors: {
        primary: '#FBBF24',
        foreground: '#FFFFFF',
        muted: '#4B5563',
        mutedForeground: '#9CA3AF',
        border: '#6B7280',
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#60A5FA',
    },
    border: {
        style: 'round',
        color: '#6B7280',
    },
};
