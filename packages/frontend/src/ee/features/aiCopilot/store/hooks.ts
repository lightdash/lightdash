// FIXES ts2742 issue with useDispatch and useSelector
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import type * as rtk from '@reduxjs/toolkit';

import { useDispatch, useSelector } from 'react-redux';
import { type AiAgentStoreDispatch, type AiAgentStoreState } from '.';

// NOTE: Use these throughout the app instead of plain `useDispatch` and `useSelector`
export const useAiAgentStoreDispatch =
    useDispatch.withTypes<AiAgentStoreDispatch>();
export const useAiAgentStoreSelector =
    useSelector.withTypes<AiAgentStoreState>();
