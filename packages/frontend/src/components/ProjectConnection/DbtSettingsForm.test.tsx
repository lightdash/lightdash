import {
    DbtProjectType,
    DefaultSupportedDbtVersion,
    WarehouseTypes,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { renderWithProviders } from '../../testing/testUtils';
import { githubDefaultValues } from './DbtForms/defaultValues';
import DbtSettingsForm from './DbtSettingsForm';
import { FormProvider, useForm } from './formContext';
import { ProjectFormProvider } from './ProjectFormProvider';

vi.mock('../common/GithubIntegration/hooks/useGithubIntegration', () => ({
    useGithubConfig: () => ({ data: { enabled: true, installationId: '123' } }),
    useGitHubRepositories: () => ({ data: [{ fullName: 'org/native' }] }),
}));

const submit = vi.fn();
const warehouse = {
    type: WarehouseTypes.POSTGRES as const,
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'test',
    dbname: 'postgres',
    schema: 'public',
};

const FormHarness = ({
    disabled = false,
    isDbtSource = false,
}: {
    disabled?: boolean;
    isDbtSource?: boolean;
}) => {
    const form = useForm({
        initialValues: {
            name: 'Existing native project',
            dbt: {
                ...githubDefaultValues,
                type: DbtProjectType.GITHUB,
                repository: 'org/native',
                branch: 'staging',
                project_sub_path: '/analytics',
                target: 'prod',
                selector: 'tag:lightdash',
            },
            dbtVersion: DefaultSupportedDbtVersion,
            warehouse,
        },
    });
    return (
        <MemoryRouter>
            <ProjectFormProvider isDbtSource={isDbtSource}>
                <FormProvider form={form}>
                    <form onSubmit={form.onSubmit(submit)}>
                        <DbtSettingsForm disabled={disabled} />
                        <button type="submit">Submit</button>
                    </form>
                </FormProvider>
            </ProjectFormProvider>
        </MemoryRouter>
    );
};

describe('native GitHub connection form', () => {
    beforeEach(() => vi.clearAllMocks());

    it('switches the build format while preserving Git and warehouse values and hiding dbt options', async () => {
        const user = userEvent.setup();
        renderWithProviders(<FormHarness />);
        expect(screen.getByLabelText('Target name')).toBeInTheDocument();
        await user.click(
            screen.getByLabelText('Semantic layer format', {
                selector: 'input',
            }),
        );
        await user.click(
            screen.getByRole('option', { name: 'Native Lightdash YAML' }),
        );
        expect(screen.queryByLabelText('Target name')).not.toBeInTheDocument();
        expect(
            screen.queryByText('dbt version', { exact: false }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText('Advanced configuration options'),
        ).not.toBeInTheDocument();
        expect(
            screen.getByText(/containing lightdash.config.yml/),
        ).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Submit' }));
        expect(submit).toHaveBeenCalledWith(
            expect.objectContaining({
                warehouse,
                dbt: expect.objectContaining({
                    semanticLayer: 'lightdash',
                    repository: 'org/native',
                    branch: 'staging',
                    project_sub_path: '/analytics',
                    installation_id: '123',
                    target: undefined,
                    selector: undefined,
                }),
            }),
            expect.anything(),
        );
    });

    it('keeps the format disabled when connection editing is forbidden', () => {
        renderWithProviders(<FormHarness disabled />);
        expect(
            screen.getByLabelText('Semantic layer format', {
                selector: 'input',
            }),
        ).toBeDisabled();
    });

    it('keeps additional dbt sources restricted to dbt builds', () => {
        renderWithProviders(<FormHarness isDbtSource />);
        expect(
            screen.queryByLabelText('Semantic layer format'),
        ).not.toBeInTheDocument();
        expect(screen.getByLabelText('Target name')).toBeInTheDocument();
    });
});
