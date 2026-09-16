import { type RouteObject } from 'react-router';
import { CommercialWebAppRoutes } from './ee/CommercialRoutes';
import Routes from './Routes';

/**
 * Route selection follows URL intent only. Responsive layouts may change with
 * the viewport, but a resize must never swap an app route for `/minimal`.
 */
export const APP_ROUTES: RouteObject[] = [...Routes, ...CommercialWebAppRoutes];
