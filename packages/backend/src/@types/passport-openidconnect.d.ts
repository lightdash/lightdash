declare module 'passport-openidconnect' {
    import { AnyType } from '@lightdash/common';
    import { Strategy as PassportStrategy } from 'passport-strategy';
    import express = require('express');

    interface IStrategyOptions {
        issuer: string;
        authorizationURL: string;
        tokenURL: string;
        userInfoURL: string;
        clientID: string;
        clientSecret: string;
        callbackURL: string;
        scope?: string;
        passReqToCallback?: false | undefined;
    }

    interface IStrategyOptionsWithRequest {
        issuer: string;
        authorizationURL: string;
        tokenURL: string;
        clientID: string;
        userInfoURL: string;
        clientSecret: string;
        callbackURL: string;
        scope?: string;
        passReqToCallback: true;
    }

    interface IVerifyOptions {
        message: string;
    }

    interface VerifyFunctionWithRequest {
        (
            req: express.Request,
            issuer: string,
            profile: AnyType,
            done: (
                error: AnyType,
                user?: AnyType,
                options?: IVerifyOptions,
            ) => void,
        ): void;
    }

    interface VerifyFunction {
        (
            issuer: string,
            profile: AnyType,
            done: (
                error: AnyType,
                user?: AnyType,
                options?: IVerifyOptions,
            ) => void,
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
