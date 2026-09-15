import {
    FeatureFlags,
    type Space,
    type SpaceDeleteImpact,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconFolderX } from '@tabler/icons-react';
import { render, screen } from '@testing-library/react';
import { DeleteSpaceModal } from './DeleteSpaceModal';

const mocks = vi.hoisted(() => ({ enabled: true, isError: false }));
const space: Space = {
    organizationUuid: 'org',
    projectUuid: 'project',
    uuid: 'space',
    name: 'Reports',
    inheritsFromOrgOrProject: false,
    queries: [],
    dashboards: [],
    access: [],
    groupsAccess: [],
    pinnedListUuid: null,
    pinnedListOrder: null,
    slug: 'reports',
    childSpaces: [],
    parentSpaceUuid: null,
    inheritParentPermissions: false,
    projectMemberAccessRole: null,
    colorPaletteUuid: null,
    path: 'space',
};
const impact: SpaceDeleteImpact = {
    spaces: [
        {
            uuid: 'space',
            name: 'Reports',
            parentSpaceUuid: null,
            chartCount: 0,
            dashboardCount: 0,
            appCount: 0,
            documentCount: 1,
        },
    ],
    documents: [{ uuid: 'doc', name: 'Weekly review', spaceUuid: 'space' }],
    charts: [],
    dashboards: [],
    apps: [],
    chartCount: 0,
    dashboardCount: 0,
    appCount: 0,
    documentCount: 1,
};
vi.mock('../../../hooks/useSpaces', () => ({
    useSpaceDeleteImpact: () => ({ data: impact, isLoading: false }),
}));
vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({
        health: { data: { softDelete: { enabled: true, retentionDays: 30 } } },
    }),
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: (flag: FeatureFlags) => ({
        data: { enabled: flag === FeatureFlags.Documents && mocks.enabled },
        isError: mocks.isError,
    }),
}));
const Modal = () => {
    const form = useForm<Space>({ initialValues: space });
    return (
        <DeleteSpaceModal
            data={space}
            form={form}
            title="Delete space"
            icon={IconFolderX}
            onClose={vi.fn()}
            handleSubmit={vi.fn()}
            isLoading={false}
        />
    );
};
describe('Space delete Document impact', () => {
    it('warns when documents are the only affected content', () => {
        mocks.enabled = true;
        mocks.isError = false;
        render(
            <MantineProvider env="test">
                <Modal />
            </MantineProvider>,
        );
        expect(screen.getByText('1 document')).toBeInTheDocument();
        expect(
            screen.getByText(
                'This will also delete content within this space:',
            ),
        ).toBeInTheDocument();
    });
    it.each([
        { enabled: false, isError: false },
        { enabled: true, isError: true },
    ])(
        'hides the document contribution when flag is unavailable %j',
        (flag) => {
            Object.assign(mocks, flag);
            render(
                <MantineProvider env="test">
                    <Modal />
                </MantineProvider>,
            );
            expect(screen.queryByText('1 document')).not.toBeInTheDocument();
            expect(
                screen.queryByText(
                    'This will also delete content within this space:',
                ),
            ).not.toBeInTheDocument();
        },
    );
});
