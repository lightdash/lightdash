import {
    type ChartKind,
    type ContentVerificationInfo,
    type DashboardTab,
} from '@lightdash/common';
import { type ReactNode } from 'react';

export type TileBaseProps<T> = {
    isEditMode: boolean;
    belongsToDashboard?: boolean;
    title: string;
    titleLeftIcon?: ReactNode;
    verification?: ContentVerificationInfo | null;
    chartName?: string;
    titleHref?: string;
    description?: string | null;
    tile: T;
    isLoading?: boolean;
    hasError?: boolean;
    chartKind?: ChartKind | null;
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
