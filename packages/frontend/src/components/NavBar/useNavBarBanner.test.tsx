import {
    OrganizationAccessStatus,
    ProjectType,
    type Project,
} from '@lightdash/common';
import { render, screen } from '@testing-library/react';
import { useNavBarBanner } from './useNavBarBanner';

const state = vi.hoisted(() => ({
    isImpersonating: false,
    access: null as OrganizationAccessStatus | null,
    upstreamType: null as ProjectType | null,
    userUuid: 'user_a',
    projectUuid: 'project_a',
    pathname: '/projects/project_a/sql-runner',
    visibility: vi.fn(),
}));
vi.mock('react-router', () => ({
    useLocation: () => ({ pathname: state.pathname }),
}));
vi.mock('../../hooks/useProject', () => ({
    useProject: () => ({
        data: state.upstreamType ? { type: state.upstreamType } : undefined,
    }),
}));
vi.mock('../../hooks/user/useImpersonation', () => ({
    useImpersonation: () => ({ isImpersonating: state.isImpersonating }),
}));
vi.mock('../../hooks/organization/useOrganizationAccess', () => ({
    useOrganizationAccess: () => ({
        data: state.access ? { status: state.access } : undefined,
    }),
}));
vi.mock('../../providers/App/useApp', () => ({
    default: () => ({ user: { data: { userUuid: state.userUuid } } }),
}));
vi.mock('./warehouseSignInBannerState', () => ({
    useWarehouseSignInBanner: () => ({
        projectUuid: state.projectUuid,
        userUuid: state.userUuid,
        status: {},
        reconnect: vi.fn(),
    }),
    setWarehouseSignInBannerVisibility: (visible: boolean) =>
        state.visibility(visible),
}));
vi.mock('./ImpersonationBanner', () => ({
    ImpersonationBanner: () => <>Impersonation</>,
}));
vi.mock('./PreviewBanner', () => ({ PreviewBanner: () => <>Preview</> }));
vi.mock('./TrialWarningBanner', () => ({
    TrialWarningBanner: () => <>Trial</>,
}));
vi.mock('./WarehouseSignInBanner', () => ({
    WarehouseSignInBanner: () => <>Warehouse</>,
}));

const Harness = ({
    type = ProjectType.DEFAULT,
    provisioningSource = null,
}: {
    type?: ProjectType;
    provisioningSource?: string | null;
}) => {
    const { hasBanner, banner } = useNavBarBanner(
        { type, provisioningSource } as Project,
        state.projectUuid,
    );
    return hasBanner ? banner : null;
};
beforeEach(() => {
    vi.clearAllMocks();
    state.isImpersonating = false;
    state.access = null;
    state.upstreamType = null;
    state.pathname = '/projects/project_a/sql-runner';
});

test('warehouse expiry uses the normal banner slot', () => {
    render(<Harness />);
    expect(screen.getByText('Warehouse')).toBeVisible();
    expect(state.visibility).toHaveBeenLastCalledWith(true);
});

test('impersonation takes priority over every other banner', () => {
    state.isImpersonating = true;
    state.access = OrganizationAccessStatus.TRIAL_WARNING;
    render(<Harness type={ProjectType.PREVIEW} />);
    expect(screen.getByText('Impersonation')).toBeVisible();
    expect(screen.queryByText('Warehouse')).toBeNull();
    expect(state.visibility).toHaveBeenLastCalledWith(false);
});

test('preview takes priority over trial and warehouse expiry', () => {
    state.access = OrganizationAccessStatus.TRIAL_WARNING;
    render(<Harness type={ProjectType.PREVIEW} />);
    expect(screen.getByText('Preview')).toBeVisible();
    expect(screen.queryByText('Warehouse')).toBeNull();
    expect(state.visibility).toHaveBeenLastCalledWith(false);
});

test.each([
    OrganizationAccessStatus.TRIAL_WARNING,
    OrganizationAccessStatus.TRIAL_EXPIRED,
])('trial status %s takes priority over warehouse expiry', (access) => {
    state.access = access;
    render(<Harness />);
    expect(screen.getByText('Trial')).toBeVisible();
    expect(screen.queryByText('Warehouse')).toBeNull();
    expect(state.visibility).toHaveBeenLastCalledWith(false);
});

test('a training copy keeps the warehouse expiry slot', () => {
    state.upstreamType = ProjectType.TRAINING;
    render(<Harness type={ProjectType.PREVIEW} />);
    expect(screen.getByText('Warehouse')).toBeVisible();
    expect(screen.queryByText('Preview')).toBeNull();
    expect(state.visibility).toHaveBeenLastCalledWith(true);
});

test('a playground project keeps the warehouse expiry slot during a trial', () => {
    state.access = OrganizationAccessStatus.TRIAL_WARNING;
    render(<Harness provisioningSource="playground" />);
    expect(screen.getByText('Warehouse')).toBeVisible();
    expect(screen.queryByText('Trial')).toBeNull();
    expect(state.visibility).toHaveBeenLastCalledWith(true);
});

test('unrelated routes hide warehouse expiry and release toast suppression', () => {
    state.pathname = '/projects/project_a/home';
    render(<Harness />);
    expect(screen.queryByText('Warehouse')).toBeNull();
    expect(state.visibility).toHaveBeenLastCalledWith(false);
});
