import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import morgan from 'morgan';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import expressSession from 'express-session';
import cookieParser from 'cookie-parser';
import { SessionUser } from 'common';
import connectSessionKnex from 'connect-session-knex';
import bodyParser from 'body-parser';
import { AuthorizationError, errorHandler } from './errors';
import { apiV1Router } from './apiV1';
import { refreshAllTables } from './lightdash';
import { UserModel } from './models/User';
import database from './database/database';
import { lightdashConfig } from './config/lightdashConfig';

const KnexSessionStore = connectSessionKnex(expressSession);

const store = new KnexSessionStore({
    knex: database as any,
    createtable: false,
    tablename: 'sessions',
    sidfieldname: 'sid',
});
const app = express();
app.use(express.json());

// Logging
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(
    expressSession({
        secret: lightdashConfig.lightdashSecret,
        proxy: lightdashConfig.trustProxy,
        cookie: {
            maxAge: 86400000, // 1 day
            secure: lightdashConfig.secureCookies,
            httpOnly: true,
            sameSite: 'lax',
        },
        resave: false,
        saveUninitialized: false,
        store,
    }),
);
app.use(passport.initialize());
app.use(passport.session());

// api router
app.use('/api/v1', apiV1Router);

// frontend
app.use(express.static(path.join(__dirname, '../../frontend/build')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/build', 'index.html'));
});

// errors
app.use(
    async (error: Error, req: Request, res: Response, next: NextFunction) => {
        await errorHandler(error, res);
    },
);

// Update all resources on startup
refreshAllTables().catch((e) =>
    console.error(`Error from dbt on Lightdash startup:\n${e.message || e}`),
);

// Run the server
const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(
        `   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |  \n \\ | / \\ | / \\ | / \\ | / \\ | / \\ | / \\ | /\n  \\|/   \\|/   \\|/   \\|/   \\|/   \\|/   \\|/\n------------------------------------------\nLaunch lightdash at http://localhost:${port}\n------------------------------------------\n  /|\\   /|\\   /|\\   /|\\   /|\\   /|\\   /|\\\n / | \\ / | \\ / | \\ / | \\ / | \\ / | \\ / | \\\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |`,
    );
});

// We need to override this interface to have our user typing
declare global {
    namespace Express {
        interface User extends SessionUser {}
    }
}

// passport config
passport.use(
    new LocalStrategy(
        { usernameField: 'email', passwordField: 'password' },
        async (email, password, done) => {
            try {
                const user = await UserModel.login(email, password);
                return done(null, user);
            } catch {
                return done(
                    new AuthorizationError(
                        'Email and password not recognized.',
                    ),
                );
            }
        },
    ),
);
passport.serializeUser((user, done) => {
    done(null, user.userUuid);
});

passport.deserializeUser(async (id: string, done) => {
    const user = await UserModel.findSessionUserByUUID(id);
    done(null, user);
});
