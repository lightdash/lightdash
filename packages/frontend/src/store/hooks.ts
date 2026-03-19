// FIXES ts2742 issue with useDispatch and useSelector
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import type * as rtk from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '.';

export const useRootDispatch = useDispatch.withTypes<AppDispatch>();
export const useRootSelector = useSelector.withTypes<RootState>();
