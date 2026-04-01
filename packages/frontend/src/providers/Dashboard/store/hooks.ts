import { useDispatch, useSelector } from 'react-redux';
import type { DashboardStoreDispatch, DashboardStoreState } from './index';

export const useDashboardDispatch =
    useDispatch.withTypes<DashboardStoreDispatch>();
export const useDashboardSelector =
    useSelector.withTypes<DashboardStoreState>();
