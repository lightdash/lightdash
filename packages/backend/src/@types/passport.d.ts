import type { Profile as PassportProfile } from 'passport';

declare module 'passport' {
    /**
     * Required for integration with node-openid-client, and specifically
     * its built-in generic passport strategy.
     */
    export interface Profile {
        email: string;
        sub: string;
        family_name: string;
        given_name: string;
    }
}
