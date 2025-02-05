/* eslint-disable react-refresh/only-export-components */
/* eslint-disable @typescript-eslint/no-unused-vars */

import EmbedDashboard from '../ee/pages/EmbedDashboard';
import EmbedProvider from '../ee/providers/Embed/EmbedProvider';
import ErrorBoundary from '../features/errorBoundary/ErrorBoundary';
import ChartColorMappingContextProvider from '../hooks/useChartColorConfig/ChartColorMappingContextProvider';
import AbilityProvider from '../providers/Ability/AbilityProvider';
import ActiveJobProvider from '../providers/ActiveJob/ActiveJobProvider';
import AppProvider from '../providers/App/AppProvider';
import MantineProvider from '../providers/MantineProvider';
import ReactQueryProvider from '../providers/ReactQuery/ReactQueryProvider';
import ThirdPartyServicesProvider from '../providers/ThirdPartyServicesProvider';
import TrackingProvider from '../providers/Tracking/TrackingProvider';

import { createEmotionCache } from '@mantine/core';

import { createBrowserRouter, Outlet, RouterProvider } from 'react-router';

export {
    AbilityProvider,
    ActiveJobProvider,
    AppProvider,
    ChartColorMappingContextProvider,
    ErrorBoundary,
    MantineProvider,
    ReactQueryProvider,
    ThirdPartyServicesProvider,
    TrackingProvider,
    createBrowserRouter,
    Outlet,
    RouterProvider,
    EmbedProvider,
    EmbedDashboard,
    createEmotionCache,
};
