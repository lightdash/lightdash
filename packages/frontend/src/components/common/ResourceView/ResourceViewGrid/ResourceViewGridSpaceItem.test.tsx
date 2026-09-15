import {
    ResourceViewItemType,
    type ResourceViewSpaceItem,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import ResourceViewGridSpaceItem from './ResourceViewGridSpaceItem';

const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: flag, isError: false }),
}));
vi.mock('../ResourceActionMenu', () => ({ default: () => null }));

const item: ResourceViewSpaceItem = {
    type: ResourceViewItemType.SPACE,
    data: {
        uuid: 'space',
        projectUuid: 'project',
        organizationUuid: 'org',
        name: 'Team space',
        parentSpaceUuid: null,
        path: 'space',
        inheritParentPermissions: true,
        pinnedListUuid: null,
        pinnedListOrder: null,
        access: [],
        accessListLength: 0,
        dashboardCount: 1,
        chartCount: 2,
        childSpaceCount: 3,
        appCount: 4,
    },
};
describe('Space card Document counts', () => {
    beforeEach(() => {
        flag.enabled = true;
    });
    const renderCard = (documentCount?: number) =>
        render(
            <MantineProvider>
                <ResourceViewGridSpaceItem
                    item={{ ...item, data: { ...item.data, documentCount } }}
                    dragIcon={null}
                    onAction={vi.fn()}
                />
            </MantineProvider>,
        );
    it('does not invent a zero for legacy pinned and favorite Space cards', () => {
        renderCard();
        expect(screen.queryByText('0')).not.toBeInTheDocument();
        expect(screen.getByText('1')).toBeInTheDocument();
    });
    it.each([0, 17])(
        'renders an explicitly authorized count of %s',
        (count) => {
            renderCard(count);
            expect(screen.getByText(String(count))).toBeInTheDocument();
        },
    );
    it('hides counts while Documents are disabled', () => {
        flag.enabled = false;
        renderCard(17);
        expect(screen.queryByText('17')).not.toBeInTheDocument();
    });
});
