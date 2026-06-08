import { type Icon as TablerIcon } from '@tabler/icons-react';

export type SettingsNavItem = {
    label: string;
    to: string;
    icon: TablerIcon;
    /** Hidden search aliases so e.g. "sso" finds "Single Sign-On". */
    keywords: string[];
    children: SettingsNavItem[];
    exact?: boolean;
    onClick?: () => void;
};

export type SettingsNavSection = {
    id: string;
    title: string;
    /** Secondary line under the title, e.g. the current project name. */
    subtitle: string | null;
    items: SettingsNavItem[];
};
