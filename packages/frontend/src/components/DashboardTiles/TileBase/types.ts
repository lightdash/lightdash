import { type DashboardTab } from '@lightdash/common';
import { type ReactNode } from 'react';

export type TileBaseProps<T> = {
    isEditMode: boolean;
    belongsToDashboard?: boolean;
    title: string;
    titleLeftIcon?: ReactNode;
    chartName?: string;
    titleHref?: string;
    description?: string | null;
    tile: T;
    isLoading?: boolean;
    hasError?: boolean;
    extraMenuItems?: ReactNode;
    onDelete: (tile: T) => void;
    onEdit: (tile: T) => void;
    children?: ReactNode;
    extraHeaderElement?: ReactNode;
    visibleHeaderElement?: ReactNode;
    minimal?: boolean;
    tabs?: DashboardTab[];
    lockHeaderVisibility?: boolean;
    transparent?: boolean;
    fullWidth?: boolean;
};
