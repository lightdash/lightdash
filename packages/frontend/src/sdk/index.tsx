/* eslint-disable react-refresh/only-export-components */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { MemoryRouter } from 'react-router';

import EmbedDashboard from '../ee/pages/EmbedDashboard';
import EmbedProvider from '../ee/providers/Embed/EmbedProvider';
import ErrorBoundary from '../features/errorBoundary/ErrorBoundary';
import ChartColorMappingContextProvider from '../hooks/useChartColorConfig/ChartColorMappingContextProvider';
import AbilityProvider from '../providers/Ability/AbilityProvider';
import ActiveJobProvider from '../providers/ActiveJob/ActiveJobProvider';
import AppProvider from '../providers/App/AppProvider';
import FullscreenProvider from '../providers/Fullscreen/FullscreenProvider';
import MantineProvider from '../providers/MantineProvider';
import ReactQueryProvider from '../providers/ReactQuery/ReactQueryProvider';
import ThirdPartyServicesProvider from '../providers/ThirdPartyServicesProvider';
import TrackingProvider from '../providers/Tracking/TrackingProvider';

export {
    AbilityProvider,
    ActiveJobProvider,
    AppProvider,
    ChartColorMappingContextProvider,
    EmbedDashboard,
    EmbedProvider,
    ErrorBoundary,
    FullscreenProvider,
    MantineProvider,
    MemoryRouter,
    ReactQueryProvider,
    ThirdPartyServicesProvider,
    TrackingProvider,
};
