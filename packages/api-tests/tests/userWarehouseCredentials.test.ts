import { SEED_PROJECT, WarehouseTypes } from '@lightdash/common';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

const CREATE_CREDENTIALS_MOCK = {
    name: 'prod auth',
    credentials: {
        type: WarehouseTypes.POSTGRES,
        user: 'username',
        password: 'password',
    },
};

const UPDATE_CREDENTIALS_MOCK = {
    name: 'prod auth 2',
    credentials: {
        type: WarehouseTypes.POSTGRES,
        user: 'username 2',
        password: 'password 2',
    },
};

type CredentialResult = {
    uuid: string;
    name: string;
    credentials: { type: string; user: string };
};
type CredentialPreferenceResult = { uuid: string } | undefined;

async function getCredentials(client: ApiClient) {
    return client.get<Body<CredentialResult[]>>(
        'api/v1/user/warehouseCredentials',
    );
}

async function createCredentials(client: ApiClient) {
    return client.post<Body<CredentialResult>>(
        'api/v1/user/warehouseCredentials',
        CREATE_CREDENTIALS_MOCK,
    );
}

async function updateCredentials(client: ApiClient, uuid: string) {
    return client.patch<Body<CredentialResult>>(
        `api/v1/user/warehouseCredentials/${uuid}`,
        UPDATE_CREDENTIALS_MOCK,
    );
}

async function deleteCredentials(client: ApiClient, uuid: string) {
    return client.delete<Body<unknown>>(
        `api/v1/user/warehouseCredentials/${uuid}`,
    );
}

async function getCredentialsPreference(client: ApiClient) {
    return client.get<Body<CredentialPreferenceResult>>(
        `api/v1/projects/${SEED_PROJECT.project_uuid}/user-credentials`,
    );
}

async function updateCredentialsPreference(client: ApiClient, uuid: string) {
    return client.patch<Body<unknown>>(
        `api/v1/projects/${SEED_PROJECT.project_uuid}/user-credentials/${uuid}`,
    );
}

describe('User Warehouse Credentials API', () => {
    let admin: Awaited<ReturnType<typeof login>>;

    beforeAll(async () => {
        admin = await login();
    });

    beforeEach(async () => {
        // Clean up any existing credentials
        const getResp = await getCredentials(admin);
        for (const { uuid } of getResp.body.results) {
            const deleteResp = await deleteCredentials(admin, uuid);
            expect(deleteResp.status).toBe(200);
        }
    });

    it('should list/create/update/delete warehouse credentials', async () => {
        // get all (empty)
        const getEmptyResponse = await getCredentials(admin);
        expect(getEmptyResponse.status).toBe(200);
        expect(getEmptyResponse.body.results.length).toBe(0);

        // create
        const createResponse = await createCredentials(admin);
        expect(createResponse.status).toBe(200);
        expect(createResponse.body.results.name).toBe(
            CREATE_CREDENTIALS_MOCK.name,
        );
        expect(createResponse.body.results.credentials.type).toBe(
            CREATE_CREDENTIALS_MOCK.credentials.type,
        );
        expect(createResponse.body.results.credentials.user).toBe(
            CREATE_CREDENTIALS_MOCK.credentials.user,
        );
        expect(createResponse.body.results.credentials).not.toHaveProperty(
            'password',
        );

        const createdUuid = createResponse.body.results.uuid;

        // get all (with results)
        const getResponse = await getCredentials(admin);
        expect(getResponse.status).toBe(200);
        expect(getResponse.body.results.length).toBe(1);
        expect(getResponse.body.results[0].name).toBe(
            CREATE_CREDENTIALS_MOCK.name,
        );
        expect(getResponse.body.results[0].credentials.type).toBe(
            CREATE_CREDENTIALS_MOCK.credentials.type,
        );
        expect(getResponse.body.results[0].credentials.user).toBe(
            CREATE_CREDENTIALS_MOCK.credentials.user,
        );
        expect(getResponse.body.results[0].credentials).not.toHaveProperty(
            'password',
        );

        // update
        const updateResponse = await updateCredentials(admin, createdUuid);
        expect(updateResponse.status).toBe(200);
        expect(updateResponse.body.results.name).toBe(
            UPDATE_CREDENTIALS_MOCK.name,
        );
        expect(updateResponse.body.results.credentials.type).toBe(
            UPDATE_CREDENTIALS_MOCK.credentials.type,
        );
        expect(updateResponse.body.results.credentials.user).toBe(
            UPDATE_CREDENTIALS_MOCK.credentials.user,
        );
        expect(updateResponse.body.results.credentials).not.toHaveProperty(
            'password',
        );

        // delete
        const deleteResponse = await deleteCredentials(admin, createdUuid);
        expect(deleteResponse.status).toBe(200);
    });

    it('should get/update project user warehouse credentials preference', async () => {
        // get preference (empty)
        const getEmptyResponse = await getCredentialsPreference(admin);
        expect(getEmptyResponse.status).toBe(200);
        expect(getEmptyResponse.body.results).toBeUndefined(); // Has no preference

        // create first credentials
        const createResponse = await createCredentials(admin);

        // get preference with fallback result
        const getFallbackResponse = await getCredentialsPreference(admin);
        expect(getFallbackResponse.status).toBe(200);
        expect(getFallbackResponse.body.results!.uuid).toBe(
            // Has fallback credentials
            createResponse.body.results.uuid,
        );

        // create second credentials
        const createSecondResponse = await createCredentials(admin);

        // update project preference
        await updateCredentialsPreference(
            admin,
            createSecondResponse.body.results.uuid,
        );

        // get preference result
        const getPreferenceResponse = await getCredentialsPreference(admin);
        expect(getPreferenceResponse.status).toBe(200);
        expect(getPreferenceResponse.body.results!.uuid).toBe(
            // Has preferred credentials
            createSecondResponse.body.results.uuid,
        );
    });
});
