import { type ComponentType } from 'react';
import { RouteChunkLoadError } from './chunkErrorHandler';

type DefaultRouteModule<Component extends ComponentType> =
    | { default?: Component }
    | undefined;

export const loadLazyRouteDefault = async <Component extends ComponentType>(
    routeModule: string,
    importer: () => Promise<DefaultRouteModule<Component>>,
): Promise<Component> => {
    const importedRouteModule = await importer();

    if (!importedRouteModule?.default) {
        throw new RouteChunkLoadError(routeModule);
    }

    return importedRouteModule.default;
};
