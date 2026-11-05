import { type HomepageRecommendedActionKey } from '@lightdash/common';
import { Container, Stack, Title } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SetupGuideView } from '../../ee/features/homepageBuilder/blocks/setupGuide/SetupGuide';
import {
    buildSetupGuide,
    type SetupGuideFacts,
    type SetupGuideRowId,
} from '../../ee/features/homepageBuilder/blocks/setupGuide/setupGuideModel';
import { type ActionStatus } from '../../ee/features/homepageBuilder/blocks/useRecommendedActions';
import { storyAgentRun } from './agentRunFixture';
import { OnboardingStory, PROJECT_UUID } from './storyApi';

const meta: Meta = {
    title: 'Onboarding/08 Homepage setup guide',
    parameters: { layout: 'fullscreen' },
};
export default meta;

type GuideState = 'fresh' | 'building' | 'mostly-done';

const status = (url: string): ActionStatus => ({
    isVisible: true,
    isComplete: false,
    annotation: null,
    doneIcon: null,
    url,
    ctaLabel: 'Set up',
});

const Guide = ({ state }: { state: GuideState }) => {
    const [isDismissed, setIsDismissed] = useState(false);
    const [skippedRows, setSkippedRows] = useState<SetupGuideRowId[]>([]);
    const [skippedActions, setSkippedActions] = useState<
        HomepageRecommendedActionKey[]
    >(
        state === 'mostly-done'
            ? ['connect-source-control', 'connect-slack']
            : [],
    );
    const facts: SetupGuideFacts = {
        projectUuid: PROJECT_UUID,
        statuses: {
            'connect-warehouse': {
                ...status('/onboarding/data-source'),
                isComplete: state !== 'fresh',
                annotation: state !== 'fresh' ? 'Postgres' : null,
            },
            'add-semantic-layer': status(
                `/projects/${PROJECT_UUID}/agent-onboarding`,
            ),
            'connect-source-control': status('/onboarding/dbt'),
            'connect-slack': status('/generalSettings/integrations'),
        },
        visibleActions: [
            'connect-warehouse',
            'add-semantic-layer',
            'connect-source-control',
            'connect-slack',
        ],
        skippedActions,
        skippedRows,
        semanticModelCount: state === 'mostly-done' ? 3 : 0,
        chartCount: state === 'mostly-done' ? 2 : 0,
        activeRun: state === 'building' ? storyAgentRun(false) : null,
        completedRun: null,
        semanticStudioUrl: null,
        canAddLiveSources: true,
        appSourceNames:
            state === 'mostly-done' ? ['PostHog', 'Wholesale accounts'] : [],
        brand: null,
        teammateCount: state === 'mostly-done' ? 2 : 0,
    };
    return (
        <Container size="lg" py="xl">
            <Stack gap="lg">
                <Title order={2}>Welcome, Maya</Title>
                <SetupGuideView
                    projectUuid={PROJECT_UUID}
                    sections={buildSetupGuide(facts)}
                    isMinimized={isDismissed}
                    onMinimizedChange={setIsDismissed}
                    onAsk={() => undefined}
                    onSkip={({ id, actionKey }) =>
                        actionKey
                            ? setSkippedActions((keys) => [...keys, actionKey])
                            : setSkippedRows((ids) => [...ids, id])
                    }
                    onRestore={({ id, actionKey }) =>
                        actionKey
                            ? setSkippedActions((keys) =>
                                  keys.filter((value) => value !== actionKey),
                              )
                            : setSkippedRows((ids) =>
                                  ids.filter((value) => value !== id),
                              )
                    }
                />
            </Stack>
        </Container>
    );
};

const guideStory = (state: GuideState): StoryObj => ({
    render: () => (
        <OnboardingStory
            path="/projects/:projectUuid"
            url={`/projects/${PROJECT_UUID}`}
            element={<Guide state={state} />}
            withNavBar
        />
    ),
});

export const Fresh: StoryObj = { ...guideStory('fresh') };
export const Building: StoryObj = {
    name: 'Warehouse connected, semantic layer building',
    ...guideStory('building'),
};
export const MostlyDone: StoryObj = {
    name: 'Mostly done with skipped steps',
    ...guideStory('mostly-done'),
};
