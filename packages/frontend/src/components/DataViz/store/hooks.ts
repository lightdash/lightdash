// FIXES ts2742 issue with useDispatch and useSelector
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import type * as rtk from '@reduxjs/toolkit';

import { useDispatch, useSelector } from 'react-redux';
import {
    type AppDispatch,
    type RootState,
} from '../../../features/sqlRunner/store';

// NOTE: Use these throughout the app instead of plain `useDispatch` and `useSelector`
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
