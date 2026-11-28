import { Ability } from '@casl/ability';
import {
    ChartKind,
    ResourceViewItemType,
    type PossibleAbilities,
    type ResourceViewComposerChartItem,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ComposerChartResourceActionMenu from './ComposerChartResourceActionMenu';
import { ResourceViewItemAction } from './types';

const mocks = vi.hoisted(() => ({ spaceRole: 'editor', canAsk: false }));
vi.mock(
    '../../../ee/features/aiCopilot/components/AskAiAgentMenuItem/useAskAiAgentAction',
    () => ({ useAskAiAgentAction: () => ({ canAsk: mocks.canAsk }) }),
);
vi.mock(
    '../../../ee/features/aiCopilot/components/AskAiAgentMenuItem/AskAiAgentMenuItem',
    () => ({ AskAiAgentMenuItem: () => <div role="menuitem">Ask AI</div> }),
);

const ability = new Ability<PossibleAbilities>([
    {
        action: 'manage',
        subject: 'SavedChart',
        conditions: {
            projectUuid: 'project',
            access: { $elemMatch: { userUuid: 'user', role: 'editor' } },
        },
    },
]);
vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({
        user: { data: { userUuid: 'user', organizationUuid: 'org', ability } },
    }),
}));
vi.mock('../../../hooks/useSpaces', () => ({
    useSpaceSummaries: () => ({
        data: [
            {
                uuid: 'space',
                inheritsFromOrgOrProject: false,
                userAccess: { userUuid: 'user', role: mocks.spaceRole },
            },
        ],
    }),
}));

const item: ResourceViewComposerChartItem = {
    type: ResourceViewItemType.COMPOSER_CHART,
    data: {
        uuid: 'chart',
        slug: 'orders',
        name: 'Orders',
        description: undefined,
        spaceUuid: 'space',
        projectUuid: 'project',
        organizationUuid: 'org',
        chartKind: ChartKind.TABLE,
        updatedAt: new Date('2026-11-28'),
        updatedByUser: null,
    },
};

const renderMenu = () => {
    const onAction = vi.fn();
    render(
        <MantineProvider>
            <ComposerChartResourceActionMenu
                item={item}
                onAction={onAction}
                isOpen
            />
        </MantineProvider>,
    );
    return onAction;
};

describe('Composer chart resource actions', () => {
    it('offers rename, move and delete to a space editor', () => {
        mocks.spaceRole = 'editor';
        mocks.canAsk = false;
        const onAction = renderMenu();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
        expect(onAction).toHaveBeenCalledWith({
            type: ResourceViewItemAction.UPDATE,
            item,
        });
        fireEvent.click(screen.getByRole('menuitem', { name: 'Move' }));
        expect(onAction).toHaveBeenCalledWith({
            type: ResourceViewItemAction.TRANSFER_TO_SPACE,
            item,
        });
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
        expect(onAction).toHaveBeenCalledWith({
            type: ResourceViewItemAction.DELETE,
            item,
        });
    });

    it('offers a space viewer only Ask AI, and no menu when they cannot ask', () => {
        mocks.spaceRole = 'viewer';
        mocks.canAsk = true;
        renderMenu();
        expect(
            screen.getByRole('menuitem', { name: 'Ask AI' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('menuitem', { name: 'Rename' }),
        ).not.toBeInTheDocument();
        cleanup();
        mocks.canAsk = false;
        renderMenu();
        expect(
            screen.queryByRole('button', { name: 'Chart actions' }),
        ).not.toBeInTheDocument();
    });
});
