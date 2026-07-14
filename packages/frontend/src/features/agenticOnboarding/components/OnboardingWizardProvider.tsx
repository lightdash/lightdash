import { OnboardingStepType, WarehouseTypes } from '@lightdash/common';
import { useCallback, useMemo, type FC } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import useApp from '../../../providers/App/useApp';
import OnboardingWizardContext, {
    type OnboardingWizardContextValue,
} from '../context/wizardContext';
import { isValidMethodForWarehouse } from '../utils/methodRegistry';
import { type ConnectMethodId } from '../utils/methodRegistry';

const isWarehouseType = (value: string | null): value is WarehouseTypes =>
    value !== null &&
    (Object.values(WarehouseTypes) as string[]).includes(value);

const deriveStepFromPath = (pathname: string): OnboardingStepType => {
    if (pathname.endsWith('/dashboard')) return OnboardingStepType.DASHBOARD;
    if (pathname.endsWith('/semantic-layer')) {
        return OnboardingStepType.SEMANTIC_LAYER;
    }
    if (pathname.endsWith('/profile')) return OnboardingStepType.PROFILE;
    return OnboardingStepType.CONNECT;
};

const STEP_PATH_SEGMENT: Record<OnboardingStepType, string> = {
    [OnboardingStepType.CONNECT]: 'connect',
    [OnboardingStepType.PROFILE]: 'profile',
    [OnboardingStepType.SEMANTIC_LAYER]: 'semantic-layer',
    [OnboardingStepType.DASHBOARD]: 'dashboard',
};

const OnboardingWizardProvider: FC<React.PropsWithChildren<{}>> = ({
    children,
}) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { projectUuid: projectUuidParam } = useParams<{
        projectUuid?: string;
    }>();
    const { health } = useApp();

    const searchParams = new URLSearchParams(location.search);
    const rawWarehouse = searchParams.get('warehouse');
    const rawMethod = searchParams.get('method');

    const warehouse = isWarehouseType(rawWarehouse) ? rawWarehouse : null;
    const method =
        warehouse &&
        rawMethod &&
        isValidMethodForWarehouse(warehouse, rawMethod)
            ? (rawMethod as ConnectMethodId)
            : null;

    const step = deriveStepFromPath(location.pathname);
    const projectUuid = projectUuidParam ?? null;

    const setConnectParams = useCallback(
        (next: {
            warehouse: WarehouseTypes | null;
            method: ConnectMethodId | null;
        }) => {
            const params = new URLSearchParams();
            if (next.warehouse) params.set('warehouse', next.warehouse);
            if (next.method) params.set('method', next.method);
            const account = new URLSearchParams(location.search).get('account');
            if (account) params.set('account', account);
            const query = params.toString();
            // Once a project exists, method switching must stay on the
            // project-scoped route or the entry guard bounces to home.
            const base = projectUuidParam
                ? `/createProject/${projectUuidParam}/connect`
                : '/createProject';
            void navigate(`${base}${query ? `?${query}` : ''}`, {
                replace: true,
            });
        },
        [navigate, projectUuidParam, location.search],
    );

    const selectWarehouse = useCallback(
        (nextWarehouse: WarehouseTypes) =>
            setConnectParams({ warehouse: nextWarehouse, method: null }),
        [setConnectParams],
    );

    const selectMethod = useCallback(
        (nextMethod: ConnectMethodId) => {
            if (!warehouse) return;
            setConnectParams({ warehouse, method: nextMethod });
        },
        [setConnectParams, warehouse],
    );

    const clearMethod = useCallback(
        () => setConnectParams({ warehouse, method: null }),
        [setConnectParams, warehouse],
    );

    const clearWarehouse = useCallback(
        () => setConnectParams({ warehouse: null, method: null }),
        [setConnectParams],
    );

    const goToProjectStep = useCallback(
        (nextProjectUuid: string, nextStep: OnboardingStepType) => {
            const segment = STEP_PATH_SEGMENT[nextStep];
            // The connect step is driven by the warehouse/method query params, so
            // preserve them; later steps don't need them.
            const suffix =
                nextStep === OnboardingStepType.CONNECT ? location.search : '';
            void navigate(
                `/createProject/${nextProjectUuid}/${segment}${suffix}`,
            );
        },
        [navigate, location.search],
    );

    const goToProjectConnect = useCallback(
        (nextProjectUuid: string, account: string | null) => {
            const params = new URLSearchParams(location.search);
            if (account) params.set('account', account);
            const query = params.toString();
            void navigate(
                `/createProject/${nextProjectUuid}/connect${
                    query ? `?${query}` : ''
                }`,
                { replace: true, state: { justCreated: true } },
            );
        },
        [navigate, location.search],
    );

    const value = useMemo<OnboardingWizardContextValue>(
        () => ({
            step,
            warehouse,
            method,
            projectUuid,
            siteUrl: health.data?.siteUrl ?? '',
            version: health.data?.version ?? '',
            demoDestination: '/',
            selectWarehouse,
            selectMethod,
            clearMethod,
            clearWarehouse,
            goToProjectStep,
            goToProjectConnect,
        }),
        [
            step,
            warehouse,
            method,
            projectUuid,
            health.data?.siteUrl,
            health.data?.version,
            selectWarehouse,
            selectMethod,
            clearMethod,
            clearWarehouse,
            goToProjectStep,
            goToProjectConnect,
        ],
    );

    return (
        <OnboardingWizardContext.Provider value={value}>
            {children}
        </OnboardingWizardContext.Provider>
    );
};

export default OnboardingWizardProvider;
