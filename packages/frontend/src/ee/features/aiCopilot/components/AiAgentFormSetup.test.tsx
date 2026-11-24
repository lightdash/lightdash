import { Button } from '@mantine/core';
import { useForm } from '@mantine/form';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOrganizationGroups } from '../../../../hooks/useOrganizationGroups';
import { renderWithProviders } from '../../../../testing/testUtils';
import { AiAgentFormSetup } from './AiAgentFormSetup';

vi.mock('../../../../hooks/useOrganizationGroups');
vi.mock('../../../../providers/App/useApp', () => ({
    default: () => ({ user: { data: undefined }, health: { data: undefined } }),
}));
vi.mock('../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        isSuccess: true,
        data: { enabled: false },
    }),
}));
vi.mock('../../../../hooks/slack/useSlack', () => ({
    useGetSlack: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('../hooks/useAiOrganizationSettings', () => ({
    useAiOrganizationSettings: () => ({ data: undefined }),
}));
vi.mock('../hooks/useAiProviderCredentials', () => ({
    useAiProviderCredentials: () => ({ data: undefined }),
}));
vi.mock('../hooks/useUserAgentPreferences', () => ({
    useGetAgentExploreAccessSummary: () => ({ isSuccess: false }),
}));
vi.mock('../hooks/useProjectAiAgents', () => ({
    useDeleteAiAgentMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('../hooks/useAiAgentModelSelection', () => ({
    useDefaultAiAgentModel: () => ({
        visibleModelOptions: [],
        selectedModelKey: null,
        selectedModel: null,
        showReasoningDefault: false,
    }),
}));
vi.mock('../../../components/UserAccessMultiSelect', () => ({
    UserAccessMultiSelect: () => null,
}));
vi.mock('./SpaceAccessSelect', () => ({ SpaceAccessSelect: () => null }));
vi.mock('./AiAgentMcpServersInput', () => ({
    AiAgentMcpServersInput: () => null,
}));
vi.mock('./AiAgentAsCodeModal', () => ({ default: () => null }));

type FormValues = ComponentProps<typeof AiAgentFormSetup>['form']['values'];

const groups = [
    { uuid: 'finance-europe', name: 'Finance Europe' },
    { uuid: 'operations', name: 'Operations' },
    { uuid: 'finance-apac', name: 'Finance APAC' },
    { uuid: 'engineering', name: 'Engineering' },
];

const AgentForm = ({
    onSubmit,
}: {
    onSubmit: (values: FormValues) => void;
}) => {
    const form = useForm<FormValues>({
        initialValues: {
            name: 'Example agent',
            description: null,
            integrations: [],
            tags: null,
            instruction: null,
            imageUrl: null,
            groupAccess: ['operations'],
            userAccess: [],
            spaceAccess: [],
            mcpServerUuids: [],
            enableDataAccess: true,
            enableSelfImprovement: false,
            enableContentTools: false,
            enableUserContext: false,
            enableSqlMode: false,
            enableSqlAutoApproval: false,
            enableComposerQueries: false,
            adminOnly: false,
            modelConfig: null,
            providerCredentialUuid: null,
            version: 1,
            threadRetentionHours: null,
        },
    });

    return (
        <MemoryRouter>
            <AiAgentFormSetup
                mode="create"
                projectUuid="project-1"
                form={form}
                onSubmit={() => onSubmit(form.values)}
                avatarMode="upload"
                avatarFileName={null}
                onAvatarFileChange={vi.fn()}
                onAvatarModeChange={vi.fn()}
                onAvatarRemove={vi.fn()}
                onAvatarRevert={null}
            />
            <Button onClick={() => onSubmit(form.values)}>Save access</Button>
        </MemoryRouter>
    );
};

describe('AI agent Group Access', () => {
    beforeEach(() => {
        vi.mocked(useOrganizationGroups).mockReturnValue({
            data: groups,
            isLoading: false,
        } as ReturnType<typeof useOrganizationGroups>);
    });

    it('filters names while preserving selected group UUIDs in form values', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn();
        renderWithProviders(<AgentForm onSubmit={onSubmit} />);

        const input = screen.getByRole('combobox', { name: /Group Access/ });
        await user.click(input);
        await user.type(input, 'fInAnCe');
        expect(input).toHaveValue('fInAnCe');

        const list = screen.getByRole('listbox');
        expect(within(list).getAllByRole('option')).toHaveLength(2);
        expect(within(list).queryByText('Engineering')).not.toBeInTheDocument();
        await user.click(
            within(list).getByRole('option', { name: 'Finance Europe' }),
        );
        await user.click(screen.getByRole('button', { name: 'Save access' }));

        expect(onSubmit).toHaveBeenLastCalledWith(
            expect.objectContaining({
                groupAccess: ['operations', 'finance-europe'],
            }),
        );
    });

    it('restores options after clearing a search and supports keyboard selection', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn();
        renderWithProviders(<AgentForm onSubmit={onSubmit} />);

        const input = screen.getByRole('combobox', { name: /Group Access/ });
        await user.type(input, 'unmatched group');
        expect(input).toHaveValue('unmatched group');
        expect(screen.queryAllByRole('option')).toHaveLength(0);
        await user.click(screen.getByRole('button', { name: 'Save access' }));
        expect(onSubmit).toHaveBeenLastCalledWith(
            expect.objectContaining({ groupAccess: ['operations'] }),
        );

        await user.clear(input);
        await user.click(input);
        expect(screen.getAllByRole('option')).toHaveLength(4);
        await user.type(input, 'engineering');
        await user.keyboard('{ArrowDown}{Enter}');
        await user.click(screen.getByRole('button', { name: 'Save access' }));
        expect(onSubmit).toHaveBeenLastCalledWith(
            expect.objectContaining({
                groupAccess: ['operations', 'engineering'],
            }),
        );
    });

    it.each([
        { data: undefined, isLoading: true, placeholder: 'Loading groups...' },
        { data: [], isLoading: false, placeholder: 'No groups available' },
    ])(
        'keeps the picker disabled with $placeholder',
        ({ data, isLoading, placeholder }) => {
            vi.mocked(useOrganizationGroups).mockReturnValue({
                data,
                isLoading,
            } as ReturnType<typeof useOrganizationGroups>);
            renderWithProviders(<AgentForm onSubmit={vi.fn()} />);

            expect(screen.getByPlaceholderText(placeholder)).toBeDisabled();
        },
    );
});
