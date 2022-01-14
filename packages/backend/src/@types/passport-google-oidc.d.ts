declare module 'passport-google-oidc' {
    import { Strategy as PassportStrategy } from 'passport-strategy';
    import express = require('express');

    interface IStrategyOptions {
        clientID: string;
        clientSecret: string;
        callbackURL: string;
        passReqToCallback?: false | undefined;
    }

    interface IStrategyOptionsWithRequest {
        clientID: string;
        clientSecret: string;
        callbackURL: string;
        passReqToCallback: true;
    }

    interface IVerifyOptions {
        message: string;
    }

    interface VerifyFunctionWithRequest {
        (
            req: express.Request,
            issuer: string,
            profile: any,
            done: (error: any, user?: any, options?: IVerifyOptions) => void,
        ): void;
    }

    interface VerifyFunction {
        (
            issuer: string,
            profile: any,
            done: (error: any, user?: any, options?: IVerifyOptions) => void,
        ): void;
    }
    export declare class Strategy extends PassportStrategy {
        constructor(
            options: IStrategyOptionsWithRequest,
            verify: VerifyFunctionWithRequest,
        );
        constructor(options: IStrategyOptions, verify: VerifyFunction);
        constructor(verify: VerifyFunction);
    }
}
