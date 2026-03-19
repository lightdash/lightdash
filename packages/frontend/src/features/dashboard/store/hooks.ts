// FIXES ts2742 issue with useDispatch and useSelector
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import type * as rtk from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import type { DashboardStoreDispatch, DashboardStoreState } from '.';

export const useDashboardStoreDispatch =
    useDispatch.withTypes<DashboardStoreDispatch>();
export const useDashboardStoreSelector =
    useSelector.withTypes<DashboardStoreState>();
