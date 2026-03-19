// Re-export root store hooks for dashboard feature consumers.
// This avoids coupling dashboard components to the root store path
// and makes migration of other features easier.
export {
    useRootDispatch as useDashboardDispatch,
    useRootSelector as useDashboardSelector,
} from '../../../store/hooks';
