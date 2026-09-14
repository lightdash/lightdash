import { Ability } from '@casl/ability';
import {
    OrganizationMemberRole,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common'; // pragma: allowlist secret
import {
    exchangeJiraCodeForToken,
    getJiraAuthorizationUrl,
    getJiraSites,
    refreshJiraToken,
} from '../../clients/jira/Jira';
import { JiraAppService } from './JiraAppService';

vi.mock('../../clients/jira/Jira', () => ({
    createJiraIssue: vi.fn(),
    exchangeJiraCodeForToken: vi.fn(),
    getJiraAuthorizationUrl: vi.fn(),
    getJiraIssueTypes: vi.fn(),
    getJiraProjects: vi.fn(),
    getJiraSites: vi.fn(),
    linkJiraIssueUrl: vi.fn(),
    refreshJiraToken: vi.fn(),
}));

const ORGANIZATION_UUID = '00000000-0000-0000-0000-000000000001';
const NOW = new Date('2026-09-02T10:00:00Z');
const user = {
    userUuid: 'user-1',
    organizationUuid: ORGANIZATION_UUID,
    organizationName: 'Acme',
    organizationCreatedAt: NOW,
    role: OrganizationMemberRole.ADMIN,
    ability: new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'Organization' },
    ]),
} as SessionUser;

const CREDENTIALS = { clientId: 'client-1', clientSecret: 'secret-1' };
const ENCRYPTED_SECRET = Buffer.from('enc:secret-1').toString('base64');

const makeService = () => {
    const trx = {};
    const model = {
        transaction: vi.fn().mockImplementation((run) => run(trx)),
        findInstallation: vi.fn().mockResolvedValue(undefined),
        getInstallation: vi.fn().mockResolvedValue({
            organizationUuid: ORGANIZATION_UUID,
            clientId: 'client-1',
            siteId: 'site-1',
            siteName: 'Acme',
            siteUrl: 'https://acme.atlassian.net',
            requiresSiteSelection: false,
        }),
        getAuth: vi.fn().mockResolvedValue({
            ...CREDENTIALS,
            token: 'access-1',
            refreshToken: 'refresh-1',
            expiresAt: new Date(Date.now() + 60_000),
            site: {
                id: 'site-1',
                name: 'Acme',
                url: 'https://acme.atlassian.net',
            },
        }),
        upsertInstallation: vi.fn(),
        updateAuth: vi.fn(),
        setSite: vi.fn(),
        deleteInstallation: vi.fn(),
    };
    const onWorkspaceChanged = vi.fn();
    const encryptionUtil = {
        encrypt: vi.fn((message: string) => Buffer.from(`enc:${message}`)),
        decrypt: vi.fn((encrypted: Buffer) =>
            encrypted.toString().replace(/^enc:/, ''),
        ),
    };
    const service = new JiraAppService({
        jiraAppInstallationsModel: model,
        encryptionUtil,
        lightdashConfig: { siteUrl: 'https://app.example.com' },
        analytics: { track: vi.fn() },
        onWorkspaceChanged,
    } as unknown as ConstructorParameters<typeof JiraAppService>[0]);
    return { service, model, trx, onWorkspaceChanged };
};

describe('JiraAppService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getJiraAuthorizationUrl).mockReturnValue(
            'https://auth.atlassian.com/authorize?test',
        );
    });

    it('starts OAuth with the credentials supplied by the organization', async () => {
        const { service, model } = makeService();
        const context = await service.installRedirect(user, {
            clientId: ' client-1 ',
            clientSecret: 'secret-1',
        });
        expect(getJiraAuthorizationUrl).toHaveBeenCalledWith(
            'client-1',
            'https://app.example.com/api/v1/jira/oauth/callback',
            context.state,
        );
        expect(context.jira).toEqual({
            redirectUri: 'https://app.example.com/api/v1/jira/oauth/callback',
            clientId: 'client-1',
            encryptedClientSecret: ENCRYPTED_SECRET,
        });
        expect(context.returnToUrl).toBe(
            'https://app.example.com/generalSettings/ai/general',
        );
        expect(model.getAuth).not.toHaveBeenCalled();
    });

    it('rejects blank credentials', async () => {
        const { service } = makeService();
        await expect(
            service.installRedirect(user, {
                clientId: 'client-1',
                clientSecret: '   ',
            }),
        ).rejects.toThrow('Jira OAuth client secret is invalid');
        expect(getJiraAuthorizationUrl).not.toHaveBeenCalled();
    });

    it('reconnects with the credentials stored for the organization', async () => {
        const { service, model } = makeService();
        const context = await service.installRedirect(user, null);
        expect(model.getAuth).toHaveBeenCalledWith(ORGANIZATION_UUID);
        expect(getJiraAuthorizationUrl).toHaveBeenCalledWith(
            'client-1',
            'https://app.example.com/api/v1/jira/oauth/callback',
            context.state,
        );
        expect(context.jira).toMatchObject({
            clientId: 'client-1',
            encryptedClientSecret: ENCRYPTED_SECRET,
        });
    });

    it('stores tokens and auto-selects the only Jira site', async () => {
        const { service, model, trx } = makeService();
        vi.mocked(exchangeJiraCodeForToken).mockResolvedValue({
            token: 'access-2',
            refreshToken: 'refresh-2',
            expiresAt: NOW,
        });
        vi.mocked(getJiraSites).mockResolvedValue([
            {
                id: 'site-1',
                name: 'Acme',
                url: 'https://acme.atlassian.net',
            },
        ]);
        await service.installCallback(
            user,
            {
                state: 'state-1',
                returnTo: 'https://app.example.com/generalSettings/ai/general',
                jira: {
                    redirectUri: 'https://app.example.com/callback',
                    clientId: 'client-1',
                    encryptedClientSecret: ENCRYPTED_SECRET,
                },
            },
            'code-1',
            'state-1',
        );
        expect(exchangeJiraCodeForToken).toHaveBeenCalledWith(
            'code-1',
            'client-1',
            'secret-1',
            'https://app.example.com/callback',
        );
        expect(model.upsertInstallation).toHaveBeenCalledWith(
            user,
            {
                ...CREDENTIALS,
                token: 'access-2',
                refreshToken: 'refresh-2',
                expiresAt: NOW,
                site: {
                    id: 'site-1',
                    name: 'Acme',
                    url: 'https://acme.atlassian.net',
                },
            },
            trx,
        );
    });

    it('clears routing when selecting a different site', async () => {
        const { service, model, trx, onWorkspaceChanged } = makeService();
        vi.mocked(getJiraSites).mockResolvedValue([
            {
                id: 'site-2',
                name: 'Other',
                url: 'https://other.atlassian.net',
            },
        ]);
        await service.selectSite(user, 'site-2');
        expect(model.setSite).toHaveBeenCalledWith(
            ORGANIZATION_UUID,
            expect.objectContaining({ id: 'site-2' }),
            trx,
        );
        expect(onWorkspaceChanged).toHaveBeenCalledWith(ORGANIZATION_UUID, trx);
    });

    it('refreshes an expired token before calling Jira', async () => {
        const { service, model } = makeService();
        model.getAuth.mockResolvedValue({
            clientId: 'client-9',
            clientSecret: 'secret-9',
            token: 'expired',
            refreshToken: 'refresh-1',
            expiresAt: new Date(0),
            site: {
                id: 'site-1',
                name: 'Acme',
                url: 'https://acme.atlassian.net',
            },
        });
        vi.mocked(refreshJiraToken).mockResolvedValue({
            token: 'access-2',
            refreshToken: 'refresh-2',
            expiresAt: NOW,
        });
        vi.mocked(getJiraSites).mockResolvedValue([]);
        await service.getSites(user);
        expect(refreshJiraToken).toHaveBeenCalledWith(
            'refresh-1',
            'client-9',
            'secret-9',
        );
        expect(model.updateAuth).toHaveBeenCalledWith(
            ORGANIZATION_UUID,
            expect.objectContaining({ token: 'access-2' }),
        );
    });
});
