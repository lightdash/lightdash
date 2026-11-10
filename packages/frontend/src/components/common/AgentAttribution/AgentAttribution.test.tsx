import {
    AgentActorSurface,
    buildAgentIdentityClaim,
    type AgentIdentityClaim,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import AgentAttribution from './AgentAttribution';

const createdBy = {
    userUuid: 'person',
    firstName: 'Ada',
    lastName: 'Lovelace',
};
const claim = (surface = AgentActorSurface.MCP) =>
    buildAgentIdentityClaim({
        subject: { type: 'user', uuid: 'person' },
        surface,
        clientId: null,
    });

describe('AgentAttribution', () => {
    it.each([
        [AgentActorSurface.MCP, 'MCP'],
        [AgentActorSurface.IN_APP_AGENT, 'In-app agent'],
        [AgentActorSurface.SLACK_AGENT, 'Slack agent'],
        [AgentActorSurface.CLI, 'CLI'],
        [AgentActorSurface.DATA_APP, 'Data app'],
        [AgentActorSurface.AI_SUMMARY, 'AI summary'],
    ])('labels %s', (surface, label) => {
        renderWithProviders(
            <AgentAttribution
                claim={claim(surface as AgentActorSurface)}
                createdBy={createdBy}
            />,
        );
        expect(
            screen.getByText(`Changed by an agent for Ada Lovelace · ${label}`),
        ).toBeVisible();
    });
    it('identifies service accounts without using a person name', () => {
        const identity = claim();
        identity.subject.type = 'service_account';
        renderWithProviders(
            <AgentAttribution claim={identity} createdBy={createdBy} />,
        );
        expect(
            screen.getByText('Changed by an agent for a service account · MCP'),
        ).toBeVisible();
    });
    it.each([null, { ...createdBy, userUuid: 'another-person' }])(
        'does not attribute unknown subjects to the author',
        (author) => {
            renderWithProviders(
                <AgentAttribution claim={claim()} createdBy={author} />,
            );
            expect(
                screen.getByText(
                    'Changed by an agent for an unknown person · MCP',
                ),
            ).toBeVisible();
        },
    );
    it('renders legacy claims without an agent uuid', () => {
        const { agent_uuid, ...act } = claim().act;
        const legacy = { ...claim(), act } as AgentIdentityClaim;
        renderWithProviders(
            <AgentAttribution claim={legacy} createdBy={createdBy} />,
        );
        expect(
            screen.getByText('Changed by an agent for Ada Lovelace · MCP'),
        ).toBeVisible();
    });
});
