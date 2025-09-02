import { test, expect } from '@playwright/test';
import { SEED_PROJECT, WarehouseTypes } from '@lightdash/common';
import { login } from '../support/auth';

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

test.describe('User Warehouse Credentials API', () => {
    test.beforeEach(async ({ request }) => {
        await login(request);
        
        // Clean up existing credentials
        const getResponse = await request.get('api/v1/user/warehouseCredentials');
        const getBody = await getResponse.json();
        
        const deletePromises = getBody.results.map(({ uuid }: { uuid: string }) =>
            request.delete(`api/v1/user/warehouseCredentials/${uuid}`)
        );
        await Promise.all(deletePromises);
    });

    test('should list/create/update/delete warehouse credentials', async ({ request }) => {
        // get all (empty)
        const getEmptyResponse = await request.get('api/v1/user/warehouseCredentials');
        expect(getEmptyResponse.status()).toBe(200);
        const getEmptyBody = await getEmptyResponse.json();
        expect(getEmptyBody.results.length).toBe(0);

        // create
        const createResponse = await request.post('api/v1/user/warehouseCredentials', {
            data: CREATE_CREDENTIALS_MOCK,
        });
        expect(createResponse.status()).toBe(200);
        const createBody = await createResponse.json();
        expect(createBody.results.name).toBe(CREATE_CREDENTIALS_MOCK.name);
        expect(createBody.results.credentials.type).toBe(CREATE_CREDENTIALS_MOCK.credentials.type);
        expect(createBody.results.credentials.user).toBe(CREATE_CREDENTIALS_MOCK.credentials.user);
        expect(createBody.results.credentials).not.toHaveProperty('password');

        // get all (with results)
        const getResponse = await request.get('api/v1/user/warehouseCredentials');
        expect(getResponse.status()).toBe(200);
        const getBody = await getResponse.json();
        expect(getBody.results.length).toBe(1);
        expect(getBody.results[0].name).toBe(CREATE_CREDENTIALS_MOCK.name);
        expect(getBody.results[0].credentials.type).toBe(CREATE_CREDENTIALS_MOCK.credentials.type);
        expect(getBody.results[0].credentials.user).toBe(CREATE_CREDENTIALS_MOCK.credentials.user);
        expect(getBody.results[0].credentials).not.toHaveProperty('password');

        // update
        const updateResponse = await request.patch(`api/v1/user/warehouseCredentials/${createBody.results.uuid}`, {
            data: UPDATE_CREDENTIALS_MOCK,
        });
        expect(updateResponse.status()).toBe(200);
        const updateBody = await updateResponse.json();
        expect(updateBody.results.name).toBe(UPDATE_CREDENTIALS_MOCK.name);
        expect(updateBody.results.credentials.type).toBe(UPDATE_CREDENTIALS_MOCK.credentials.type);
        expect(updateBody.results.credentials.user).toBe(UPDATE_CREDENTIALS_MOCK.credentials.user);
        expect(updateBody.results.credentials).not.toHaveProperty('password');

        // delete
        const deleteResponse = await request.delete(`api/v1/user/warehouseCredentials/${createBody.results.uuid}`);
        expect(deleteResponse.status()).toBe(200);
    });

    test('should get/update project user warehouse credentials preference', async ({ request }) => {
        // get preference (empty)
        const getEmptyResponse = await request.get(`api/v1/projects/${SEED_PROJECT.project_uuid}/user-credentials`);
        expect(getEmptyResponse.status()).toBe(200);
        const getEmptyBody = await getEmptyResponse.json();
        expect(getEmptyBody.results).toBeUndefined(); // Has no preference
        
        // create first credentials
        const createResponse = await request.post('api/v1/user/warehouseCredentials', {
            data: CREATE_CREDENTIALS_MOCK,
        });
        const createBody = await createResponse.json();

        // get preference with fallback result
        const getFallbackResponse = await request.get(`api/v1/projects/${SEED_PROJECT.project_uuid}/user-credentials`);
        expect(getFallbackResponse.status()).toBe(200);
        const getFallbackBody = await getFallbackResponse.json();
        expect(getFallbackBody.results.uuid).toBe(createBody.results.uuid); // Has fallback credentials
        
        // create second credentials
        const createSecondResponse = await request.post('api/v1/user/warehouseCredentials', {
            data: CREATE_CREDENTIALS_MOCK,
        });
        const createSecondBody = await createSecondResponse.json();

        // update project preference
        await request.patch(`api/v1/projects/${SEED_PROJECT.project_uuid}/user-credentials/${createSecondBody.results.uuid}`);

        // get preference result
        const getPreferenceResponse = await request.get(`api/v1/projects/${SEED_PROJECT.project_uuid}/user-credentials`);
        expect(getPreferenceResponse.status()).toBe(200);
        const getPreferenceBody = await getPreferenceResponse.json();
        expect(getPreferenceBody.results.uuid).toBe(createSecondBody.results.uuid); // Has preferred credentials
    });
});