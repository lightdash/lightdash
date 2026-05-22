import {
    ContentAsCodeType,
    DashboardTileTypes,
    type DashboardAsCode,
} from '@lightdash/common';
import { AiAgentContentValidation } from './AiAgentContentValidation';

const makeDashboard = (): DashboardAsCode => ({
    name: 'AI agents usage',
    description: '',
    tiles: [
        {
            type: DashboardTileTypes.MARKDOWN,
            x: 0,
            y: 0,
            h: 4,
            w: 36,
            tabUuid: null,
            uuid: undefined,
            tileSlug: undefined,
            properties: {
                title: 'Markdown',
                content: 'Hello',
                hideFrame: false,
            },
        },
        {
            type: DashboardTileTypes.HEADING,
            x: 0,
            y: 4,
            h: 2,
            w: 36,
            tabUuid: '8b4ba1af-05f9-4d69-a5ca-6b1e6dfc6f95',
            uuid: undefined,
            tileSlug: undefined,
            properties: {
                text: 'Section',
                showDivider: true,
            },
        },
        {
            type: DashboardTileTypes.DATA_APP,
            x: 0,
            y: 6,
            h: 8,
            w: 36,
            tabUuid: '8b4ba1af-05f9-4d69-a5ca-6b1e6dfc6f95',
            uuid: undefined,
            tileSlug: undefined,
            properties: {
                title: 'App',
                hideTitle: false,
                appUuid: 'e88b4f58-6e69-4591-a53a-df261bb60698',
                appDeletedAt: null,
            },
        },
    ],
    tabs: [
        {
            uuid: '8b4ba1af-05f9-4d69-a5ca-6b1e6dfc6f95',
            name: 'Hidden tab',
            order: 0,
            hidden: true,
        },
    ],
    slug: 'ai-agents-usage',
    spaceSlug: 'ai-agents-feature',
    version: 1,
    contentType: ContentAsCodeType.DASHBOARD,
    verified: true,
    verification: null,
});

describe('AiAgentContentValidation', () => {
    it('accepts verified dashboards returned by readContent', () => {
        const validator = new AiAgentContentValidation();

        expect(() =>
            validator.validateContent('dashboard', makeDashboard()),
        ).not.toThrow();
    });

    it('rejects patches that try to edit verified state directly', () => {
        const validator = new AiAgentContentValidation();

        expect(() =>
            validator.validatePatch('dashboard', [
                {
                    op: 'remove',
                    path: '/verified',
                },
            ]),
        ).toThrow(
            'Patch contains disallowed paths:\n- patch[0].path: Patch path "/verified" is not allowed: verified cannot be edited with editContent',
        );
    });
});
