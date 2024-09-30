import { SEED_PROJECT, WarehouseTypes } from '@lightdash/common';

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

const getCredentials = () =>
    cy.request({
        url: `api/v1/user/warehouseCredentials`,
        method: 'GET',
    });

const createCredentials = () =>
    cy.request({
        url: `api/v1/user/warehouseCredentials`,
        method: 'POST',
        body: CREATE_CREDENTIALS_MOCK,
    });

const updateCredentials = (uuid: string) =>
    cy.request({
        url: `api/v1/user/warehouseCredentials/${uuid}`,
        method: 'PATCH',
        body: UPDATE_CREDENTIALS_MOCK,
    });

const deleteCredentials = (uuid: string) =>
    cy.request({
        url: `api/v1/user/warehouseCredentials/${uuid}`,
        method: 'DELETE',
    });

const getCredentialsPreference = () =>
    cy.request({
        url: `api/v1/projects/${SEED_PROJECT.project_uuid}/user-credentials`,
        method: 'GET',
    });

const updateCredentialsPreference = (uuid: string) =>
    cy.request({
        url: `api/v1/projects/${SEED_PROJECT.project_uuid}/user-credentials/${uuid}`,
        method: 'PATCH',
    });

describe('User Warehouse Credentials API', () => {
    beforeEach(() => {
        cy.login();
        getCredentials().then((getEmptyResponse) => {
            getEmptyResponse.body.results.forEach(({ uuid }) => {
                deleteCredentials(uuid).then((deleteResponse) => {
                    expect(deleteResponse.status).to.eq(200);
                });
            });
        });
    });

    it('should list/create/update/delete warehouse credentials', () => {
        // get all (empty)
        getCredentials().then((getEmptyResponse) => {
            expect(getEmptyResponse.status).to.eq(200);
            expect(getEmptyResponse.body.results.length).to.eq(0);

            // create
            createCredentials().then((createResponse) => {
                expect(createResponse.status).to.eq(200);
                expect(createResponse.body.results.name).to.eq(
                    CREATE_CREDENTIALS_MOCK.name,
                );
                expect(createResponse.body.results.credentials.type).to.eq(
                    CREATE_CREDENTIALS_MOCK.credentials.type,
                );
                expect(createResponse.body.results.credentials.user).to.eq(
                    CREATE_CREDENTIALS_MOCK.credentials.user!,
                );
                expect(
                    createResponse.body.results.credentials,
                ).to.not.have.property('password');

                // get all (with results)
                getCredentials().then((getResponse) => {
                    expect(getResponse.status).to.eq(200);
                    expect(getResponse.body.results.length).to.eq(1);
                    expect(getResponse.body.results[0].name).to.eq(
                        CREATE_CREDENTIALS_MOCK.name,
                    );
                    expect(getResponse.body.results[0].credentials.type).to.eq(
                        CREATE_CREDENTIALS_MOCK.credentials.type,
                    );
                    expect(getResponse.body.results[0].credentials.user).to.eq(
                        CREATE_CREDENTIALS_MOCK.credentials.user!,
                    );
                    expect(
                        getResponse.body.results[0].credentials,
                    ).to.not.have.property('password');

                    // update
                    updateCredentials(createResponse.body.results.uuid).then(
                        (updateResponse) => {
                            expect(updateResponse.status).to.eq(200);
                            expect(updateResponse.body.results.name).to.eq(
                                UPDATE_CREDENTIALS_MOCK.name,
                            );
                            expect(
                                updateResponse.body.results.credentials.type,
                            ).to.eq(UPDATE_CREDENTIALS_MOCK.credentials.type);
                            expect(
                                updateResponse.body.results.credentials.user,
                            ).to.eq(UPDATE_CREDENTIALS_MOCK.credentials.user!);
                            expect(
                                updateResponse.body.results.credentials,
                            ).to.not.have.property('password');

                            // delete
                            deleteCredentials(
                                createResponse.body.results.uuid,
                            ).then((deleteResponse) => {
                                expect(deleteResponse.status).to.eq(200);
                            });
                        },
                    );
                });
            });
        });
    });

    it('should get/update project user warehouse credentials preference', () => {
        // get preference (empty)
        getCredentialsPreference().then((getEmptyResponse) => {
            expect(getEmptyResponse.status).to.eq(200);
            expect(getEmptyResponse.body.results).to.eq(undefined); // Has no preference
            // create first credentials
            createCredentials().then((createResponse) => {
                // get preference with fallback result
                getCredentialsPreference().then((getFallbackResponse) => {
                    expect(getFallbackResponse.status).to.eq(200);
                    expect(getFallbackResponse.body.results.uuid).to.eq(
                        // Has fallback credentials
                        createResponse.body.results.uuid,
                    );
                    // create second credentials
                    createCredentials().then((createSecondResponse) => {
                        // update project preference
                        updateCredentialsPreference(
                            createSecondResponse.body.results.uuid,
                        ).then(() => {
                            // get preference result
                            getCredentialsPreference().then(
                                (getPreferenceResponse) => {
                                    expect(getPreferenceResponse.status).to.eq(
                                        200,
                                    );
                                    expect(
                                        getPreferenceResponse.body.results.uuid,
                                    ).to.eq(
                                        // Has preferred credentials
                                        createSecondResponse.body.results.uuid,
                                    );
                                },
                            );
                        });
                    });
                });
            });
        });
    });
});
