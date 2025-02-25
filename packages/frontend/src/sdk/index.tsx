/* eslint-disable react-refresh/only-export-components */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { MemoryRouter } from 'react-router';

import { type LanguageMap } from '@lightdash/common';
import EmbedDashboard from '../ee/pages/EmbedDashboard';
import EmbedProvider from '../ee/providers/Embed/EmbedProvider';
import ErrorBoundary from '../features/errorBoundary/ErrorBoundary';
import ChartColorMappingContextProvider from '../hooks/useChartColorConfig/ChartColorMappingContextProvider';
import AbilityProvider from '../providers/Ability/AbilityProvider';
import AppProvider from '../providers/App/AppProvider';
import FullscreenProvider from '../providers/Fullscreen/FullscreenProvider';
import MantineProvider from '../providers/MantineProvider';
import ReactQueryProvider from '../providers/ReactQuery/ReactQueryProvider';
import ThirdPartyServicesProvider from '../providers/ThirdPartyServicesProvider';
import TrackingProvider from '../providers/Tracking/TrackingProvider';

import { type SdkFilter } from '../ee/features/embed/EmbedDashboard/types';
const LIGHTDASH_SDK_INSTANCE_URL_LOCAL_STORAGE_KEY =
    '__lightdash_sdk_instance_url';

export {
    AbilityProvider,
    AppProvider,
    ChartColorMappingContextProvider,
    EmbedDashboard,
    EmbedProvider,
    ErrorBoundary,
    FullscreenProvider,
    LIGHTDASH_SDK_INSTANCE_URL_LOCAL_STORAGE_KEY,
    MantineProvider,
    MemoryRouter,
    ReactQueryProvider,
    ThirdPartyServicesProvider,
    TrackingProvider,
    type LanguageMap,
    type SdkFilter,
};
