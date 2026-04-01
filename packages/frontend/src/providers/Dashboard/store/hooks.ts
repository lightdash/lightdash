// FIXES ts2742 issue with useDispatch and useSelector
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import type * as rtk from '@reduxjs/toolkit';
import { useDispatch, useSelector, useStore } from 'react-redux';
import type { DashboardStoreDispatch, DashboardStoreState } from '.';

// ts-unused-exports:disable-next-line
export const useDashboardDispatch =
    useDispatch.withTypes<DashboardStoreDispatch>();
// ts-unused-exports:disable-next-line
export const useDashboardSelector =
    useSelector.withTypes<DashboardStoreState>();

// ts-unused-exports:disable-next-line
export const useDashboardStore = () => {
    const store = useStore();
    return store as { getState: () => DashboardStoreState };
};
