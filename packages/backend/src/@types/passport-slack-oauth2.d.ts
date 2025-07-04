declare module 'passport-slack-oauth2' {
    import { AnyType } from '@lightdash/common';
    import { Strategy as PassportStrategy } from 'passport-strategy';
    import express = require('express');

    interface IStrategyOptions {
        clientID: string;
        clientSecret: string;
        scope: string[];
        callbackURL?: string;
        state?: boolean;
        passReqToCallback: true;
    }

    interface IVerifyOptions {
        message: string;
    }

    interface SlackProfile {
        user: { name: string; id: string };
        team: { id: string };
        provider: string;
        id: string;
        displayName: string;
    }
    interface VerifyFunction {
        (
            req: express.Request,
            accessToken: string,
            refreshToken: string,
            profile: SlackProfile,
            done: (
                error: AnyType,
                user?: AnyType,
                options?: IVerifyOptions,
            ) => void,
        ): void;
    }
    export declare class Strategy extends PassportStrategy {
        constructor(options: IStrategyOptions, verify: VerifyFunction);
        constructor(verify: VerifyFunction);
    }
}
