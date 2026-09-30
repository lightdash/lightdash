import { DefaultSupportedDbtVersion, WarehouseTypes } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { renderWithProviders } from '../../../testing/testUtils';
import { FormProvider, useForm } from '../formContext';
import { ProjectFormProvider } from '../ProjectFormProvider';
import type { ProjectConnectionForm } from '../types';
import { githubDefaultValues } from './defaultValues';
import GithubForm from './GithubForm';
import { dbtFormValidators } from './validators';

// An org without a GitHub App installation: /api/v1/github/config 404s.
vi.mock('../../common/GithubIntegration/hooks/useGithubIntegration', () => ({
    useGithubConfig: () => ({
        data: undefined,
        isError: true,
        refetch: vi.fn(),
    }),
    useGitHubRepositories: () => ({
        data: undefined,
        isError: true,
        refetch: vi.fn(),
    }),
}));

const submit = vi.fn();

const Harness = ({ dbt }: { dbt: ProjectConnectionForm['dbt'] }) => {
    const form = useForm({
        initialValues: {
            name: 'project',
            dbt,
            dbtVersion: DefaultSupportedDbtVersion,
            warehouse: {
                type: WarehouseTypes.POSTGRES as const,
                host: 'localhost',
                port: 5432,
                user: 'postgres',
                password: 'test',
                dbname: 'postgres',
                schema: 'public',
            },
        },
        validate: { dbt: dbtFormValidators },
    });
    return (
        <MemoryRouter>
            <ProjectFormProvider>
                <FormProvider form={form}>
                    <form onSubmit={form.onSubmit(submit)}>
                        <GithubForm disabled={false} />
                        <button type="submit">Submit</button>
                    </form>
                </FormProvider>
            </ProjectFormProvider>
        </MemoryRouter>
    );
};

describe('GithubForm without a GitHub App installation', () => {
    beforeEach(() => submit.mockClear());

    it('blocks submitting an OAuth connection and explains why', async () => {
        const user = userEvent.setup();
        renderWithProviders(
            <Harness
                dbt={{ ...githubDefaultValues, repository: 'org/repo' }}
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Submit' }));

        await waitFor(() =>
            expect(
                screen.getByText(
                    /GitHub App is not connected to your organization/,
                ),
            ).toBeInTheDocument(),
        );
        expect(submit).not.toHaveBeenCalled();
    });

    it('still submits a personal access token connection', async () => {
        const user = userEvent.setup();
        renderWithProviders(
            <Harness
                dbt={{
                    ...githubDefaultValues,
                    authorization_method: 'personal_access_token',
                    personal_access_token: 'ghp_token',
                    repository: 'org/repo',
                }}
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Submit' }));

        await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    });
});

describe('installation_id validator', () => {
    const base = {
        name: 'p',
        dbtVersion: DefaultSupportedDbtVersion,
        warehouse: {},
    } as unknown as ProjectConnectionForm;

    it('ignores non-GitHub connections', () => {
        expect(
            dbtFormValidators.installation_id('', {
                ...base,
                dbt: {
                    type: 'gitlab',
                    personal_access_token: 'x',
                    repository: 'o/r',
                    branch: 'main',
                    project_sub_path: '/',
                } as ProjectConnectionForm['dbt'],
            }),
        ).toBeUndefined();
    });
});
