import { ParameterError } from '@lightdash/common';
import {
    getDatabricksOidcEndpointsFromHost,
    normalizeDatabricksHostLenient,
} from './databricksStrategy';

describe('getDatabricksOidcEndpointsFromHost', () => {
    it.each([
        'dbc-123.cloud.databricks.com',
        'dbc-123.dev.databricks.com',
        '123.gcp.databricks.com',
        'adb-123.4.azuredatabricks.net',
        'adb-123.databricks.azure.cn',
        'adb-123.databricks.azure.us',
        'dbc-123.cloud.databricks.us',
        'dbc-123.cloud.databricks.mil',
    ])('constructs OAuth endpoints for %s', (serverHostName) => {
        expect(getDatabricksOidcEndpointsFromHost(serverHostName)).toEqual({
            host: serverHostName,
            issuer: `https://${serverHostName}`,
            authorizationURL: `https://${serverHostName}/oidc/v1/authorize`,
            tokenURL: `https://${serverHostName}/oidc/v1/token`,
        });
    });

    it.each([
        'attacker.example.com',
        'localhost:4443',
        'cloud.databricks.com',
        'fakecloud.databricks.com',
        'dbc-123.cloud.databricks.com.attacker.example',
        'dbc-123.cloud.databricks.com:8443',
    ])('rejects a non-workspace OAuth endpoint at %s', (serverHostName) => {
        expect(() =>
            getDatabricksOidcEndpointsFromHost(serverHostName),
        ).toThrow(ParameterError);
    });
});

describe('normalizeDatabricksHostLenient', () => {
    it('keeps URL and bare-host representations equivalent', () => {
        expect(
            normalizeDatabricksHostLenient('https://workspace.example.com'),
        ).toBe(normalizeDatabricksHostLenient('workspace.example.com'));
    });
});
