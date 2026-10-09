import { useMatches } from 'react-router';

// Routes opt out of the launcher by setting `handle: { hideAILauncher: true }`
// on their RouteObject; the flag is inherited by all child routes.
export const useIsLauncherHidden = () => {
    const matches = useMatches();
    return matches.some(
        (m) =>
            (m.handle as { hideAILauncher?: boolean } | undefined)
                ?.hideAILauncher,
    );
};
