import { LightdashMode, SessionUser } from '@lightdash/common';
import { NodeSDK } from '@opentelemetry/sdk-node';
import * as Sentry from '@sentry/node';
import * as Tracing from '@sentry/tracing';
import { SamplingContext } from '@sentry/types';
import flash from 'connect-flash';
import connectSessionKnex from 'connect-session-knex';
import express, {
    Express,
    NextFunction,
    Request,
    RequestHandler,
    Response,
} from 'express';
import expressSession from 'express-session';
import expressStaticGzip from 'express-static-gzip';
import knex, { Knex } from 'knex';
import passport from 'passport';
import refresh from 'passport-oauth2-refresh';
import path from 'path';
import reDoc from 'redoc-express';
import { URL } from 'url';
import { LightdashAnalytics } from './analytics/LightdashAnalytics';
import {
    ClientProviderMap,
    ClientRepository,
} from './clients/ClientRepository';
import { SlackBot } from './clients/Slack/Slackbot';
import { LightdashConfig } from './config/parseConfig';
import {
    apiKeyPassportStrategy,
    createAzureAdPassportStrategy,
    createGenericOidcPassportStrategy,
    googlePassportStrategy,
    isAzureAdPassportStrategyAvailableToUse,
    isGenericOidcPassportStrategyAvailableToUse,
    isOktaPassportStrategyAvailableToUse,
    localPassportStrategy,
    oneLoginPassportStrategy,
    OpenIDClientOktaStrategy,
} from './controllers/authentication';
import { errorHandler } from './errors';
import { RegisterRoutes } from './generated/routes';
import apiSpec from './generated/swagger.json';
import Logger from './logging/logger';
import { expressWinstonMiddleware } from './logging/winston';
import { ModelProviderMap, ModelRepository } from './models/ModelRepository';
import { registerNodeMetrics } from './nodeMetrics';
import { postHogClient } from './postHog';
import { apiV1Router } from './routers/apiV1Router';
import { SchedulerWorker } from './scheduler/SchedulerWorker';
import {
    OperationContext,
    ServiceProviderMap,
    ServiceRepository,
} from './services/ServiceRepository';
import { UtilProviderMap, UtilRepository } from './utils/UtilRepository';
import { VERSION } from './version';

// We need to override this interface to have our user typing
declare global {
    namespace Express {
        /**
         * There's potentially a good case for NOT including this under the top-level of the Request,
         * but instead under `locals` - I've yet to see a good reasoning on -why-, so for now I'm
         * opting for the keystrokes saved through omitting `.locals`.
         */
        interface Request {
            services: ServiceRepository;
            /**
             * @deprecated Clients should be used inside services. This will be removed soon.
             */
            clients: ClientRepository;
        }

        interface User extends SessionUser {}
    }
}

const schedulerWorkerFactory = (context: {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    serviceRepository: ServiceRepository;
    models: ModelRepository;
    clients: ClientRepository;
    utils: UtilRepository;
}) =>
    new SchedulerWorker({
        lightdashConfig: context.lightdashConfig,
        analytics: context.analytics,
        unfurlService: context.serviceRepository.getUnfurlService(),
        csvService: context.serviceRepository.getCsvService(),
        dashboardService: context.serviceRepository.getDashboardService(),
        projectService: context.serviceRepository.getProjectService(),
        schedulerService: context.serviceRepository.getSchedulerService(),
        validationService: context.serviceRepository.getValidationService(),
        userService: context.serviceRepository.getUserService(),
        emailClient: context.clients.getEmailClient(),
        googleDriveClient: context.clients.getGoogleDriveClient(),
        s3Client: context.clients.getS3Client(),
        schedulerClient: context.clients.getSchedulerClient(),
        slackClient: context.clients.getSlackClient(),
    });

const slackBotFactory = (context: {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    serviceRepository: ServiceRepository;
    models: ModelRepository;
}) =>
    new SlackBot({
        lightdashConfig: context.lightdashConfig,
        analytics: context.analytics,
        slackAuthenticationModel: context.models.getSlackAuthenticationModel(),
        unfurlService: context.serviceRepository.getUnfurlService(),
    });

type AppArguments = {
    lightdashConfig: LightdashConfig;
    port: string | number;
    otelSdk: NodeSDK;
    environment?: 'production' | 'development';
    serviceProviders?: ServiceProviderMap;
    knexConfig: {
        production: Knex.Config<Knex.PgConnectionConfig>;
        development: Knex.Config<Knex.PgConnectionConfig>;
    };
    clientProviders?: ClientProviderMap;
    modelProviders?: ModelProviderMap;
    utilProviders?: UtilProviderMap;
    slackBotFactory?: typeof slackBotFactory;
    schedulerWorkerFactory?: typeof schedulerWorkerFactory;
};

export default class App {
    private readonly serviceRepository: ServiceRepository;

    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly otelSdk: NodeSDK;

    private readonly port: string | number;

    private readonly environment: 'production' | 'development';

    private schedulerWorker: SchedulerWorker | undefined;

    private readonly clients: ClientRepository;

    private readonly utils: UtilRepository;

    private readonly models: ModelRepository;

    private readonly database: Knex;

    private readonly slackBotFactory: typeof slackBotFactory;

    private readonly schedulerWorkerFactory: typeof schedulerWorkerFactory;

    constructor(args: AppArguments) {
        this.lightdashConfig = args.lightdashConfig;
        this.otelSdk = args.otelSdk;
        this.port = args.port;
        this.environment = args.environment || 'production';
        this.analytics = new LightdashAnalytics({
            lightdashConfig: this.lightdashConfig,
            writeKey: this.lightdashConfig.rudder.writeKey || 'notrack',
            dataPlaneUrl: this.lightdashConfig.rudder.dataPlaneUrl
                ? `${this.lightdashConfig.rudder.dataPlaneUrl}/v1/batch`
                : 'notrack',
            options: {
                enable:
                    this.lightdashConfig.rudder.writeKey &&
                    this.lightdashConfig.rudder.dataPlaneUrl,
            },
        });
        this.database = knex(
            this.environment === 'production'
                ? args.knexConfig.production
                : args.knexConfig.development,
        );
        this.utils = new UtilRepository({
            utilProviders: args.utilProviders,
            lightdashConfig: this.lightdashConfig,
        });
        this.models = new ModelRepository({
            modelProviders: args.modelProviders,
            lightdashConfig: this.lightdashConfig,
            database: this.database,
            utils: this.utils,
        });
        this.clients = new ClientRepository({
            clientProviders: args.clientProviders,
            context: new OperationContext({
                operationId: 'App#ctor',
                lightdashAnalytics: this.analytics,
                lightdashConfig: this.lightdashConfig,
            }),
            models: this.models,
        });
        this.serviceRepository = new ServiceRepository({
            serviceProviders: args.serviceProviders,
            context: new OperationContext({
                operationId: 'App#ctor',
                lightdashAnalytics: this.analytics,
                lightdashConfig: this.lightdashConfig,
            }),
            clients: this.clients,
            models: this.models,
        });
        this.slackBotFactory = args.slackBotFactory || slackBotFactory;
        this.schedulerWorkerFactory =
            args.schedulerWorkerFactory || schedulerWorkerFactory;
    }

    async start() {
        // @ts-ignore
        // eslint-disable-next-line no-extend-native, func-names
        BigInt.prototype.toJSON = function () {
            return this.toString();
        };

        if (this.environment !== 'development') {
            App.initNodeProcessMonitor();
        }

        const expressApp = await this.initExpress();
        this.initSentry(expressApp);
        this.initSlack().catch((e) => {
            Logger.error('Error starting slack bot', e);
        });
        if (this.lightdashConfig.scheduler?.enabled) {
            this.initSchedulerWorker();
        }
    }

    private async initExpress() {
        const expressApp = express();

        const KnexSessionStore = connectSessionKnex(expressSession);

        const store = new KnexSessionStore({
            knex: this.database as any,
            createtable: false,
            tablename: 'sessions',
            sidfieldname: 'sid',
        });

        expressApp.use(
            express.json({ limit: this.lightdashConfig.maxPayloadSize }),
        );

        expressApp.use(express.json());
        expressApp.use(express.urlencoded({ extended: false }));

        expressApp.use(
            expressSession({
                secret: this.lightdashConfig.lightdashSecret,
                proxy: this.lightdashConfig.trustProxy,
                rolling: true,
                cookie: {
                    maxAge:
                        (this.lightdashConfig.cookiesMaxAgeHours || 24) *
                        60 *
                        60 *
                        1000, // in ms
                    secure: this.lightdashConfig.secureCookies,
                    httpOnly: true,
                    sameSite: 'lax',
                },
                resave: false,
                saveUninitialized: false,
                store,
            }),
        );
        expressApp.use(flash());
        expressApp.use(passport.initialize());
        expressApp.use(passport.session());

        expressApp.use(expressWinstonMiddleware);

        expressApp.get('/', (req, res) => {
            res.sendFile(
                path.join(__dirname, '../../frontend/build', 'index.html'),
                {
                    headers: { 'Cache-Control': 'no-cache, private' },
                },
            );
        });

        /**
         * Service Container
         *
         * In a future iteration, the service repository will be aware of the surrounding
         * request context - for now we simply proxy the existing service repository singleton.
         */
        expressApp.use((req, res, next) => {
            req.services = this.serviceRepository;
            req.clients = this.clients;
            next();
        });

        // api router
        expressApp.use('/api/v1', apiV1Router);
        RegisterRoutes(expressApp);
        // Api docs
        if (
            this.lightdashConfig.mode === LightdashMode.PR ||
            this.environment !== 'production'
        ) {
            expressApp.get('/api/docs/openapi.json', (req, res) => {
                res.send(apiSpec);
            });
            expressApp.get(
                '/api/docs',
                reDoc({
                    title: `${this.lightdashConfig.siteName} API Docs`,
                    specUrl: '/api/docs/openapi.json',
                }),
            );
        }

        // frontend assets - immutable because vite appends hash to filenames
        expressApp.use(
            '/assets',
            expressStaticGzip(
                path.join(__dirname, '../../frontend/build/assets'),
                {
                    index: false,
                    customCompressions: [
                        {
                            encodingName: 'gzip',
                            fileExtension: 'gzip',
                        },
                    ],
                },
            ),
        );
        // frontend static files - no cache
        expressApp.use(
            express.static(path.join(__dirname, '../../frontend/build'), {
                setHeaders: () => ({
                    // private - browsers can cache but not CDNs
                    // no-cache - caches must revalidate with the origin server before using a cached copy
                    'Cache-Control': 'no-cache, private',
                }),
            }),
        );

        expressApp.get('*', (req, res) => {
            res.sendFile(
                path.join(__dirname, '../../frontend/build', 'index.html'),
                {
                    headers: { 'Cache-Control': 'no-cache, private' },
                },
            );
        });

        // Start the server
        expressApp.listen(this.port, () => {
            if (this.environment === 'production') {
                Logger.info(
                    `\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |  \n \\ | / \\ | / \\ | / \\ | / \\ | / \\ | / \\ | /\n  \\|/   \\|/   \\|/   \\|/   \\|/   \\|/   \\|/\n------------------------------------------\nLaunch ${this.lightdashConfig.siteName} at http://localhost:${this.port}\n------------------------------------------\n  /|\\   /|\\   /|\\   /|\\   /|\\   /|\\   /|\\\n / | \\ / | \\ / | \\ / | \\ / | \\ / | \\ / | \\\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |`,
                );
            }
        });

        // Errors
        expressApp.use(Sentry.Handlers.errorHandler()); // The Sentry error handler must be before any other error middleware and after all controllers
        expressApp.use(
            (error: Error, req: Request, res: Response, _: NextFunction) => {
                const errorResponse = errorHandler(error);
                Logger.error(
                    `Handled error of type ${errorResponse.name} on [${req.method}] ${req.path}`,
                    errorResponse,
                );
                this.analytics.track({
                    event: 'api.error',
                    userId: req.user?.userUuid,
                    anonymousId: !req.user?.userUuid
                        ? LightdashAnalytics.anonymousId
                        : undefined,
                    properties: {
                        name: errorResponse.name,
                        statusCode: errorResponse.statusCode,
                        route: req.path,
                        method: req.method,
                    },
                });
                res.status(errorResponse.statusCode).send({
                    status: 'error',
                    error: {
                        statusCode: errorResponse.statusCode,
                        name: errorResponse.name,
                        message: errorResponse.message,
                        data: errorResponse.data,
                    },
                });
            },
        );

        // Authentication
        const userService = this.serviceRepository.getUserService();

        passport.use(apiKeyPassportStrategy({ userService }));
        passport.use(
            localPassportStrategy({
                userService,
            }),
        );
        if (googlePassportStrategy) {
            passport.use(googlePassportStrategy);
            refresh.use(googlePassportStrategy);
        }
        if (isOktaPassportStrategyAvailableToUse) {
            passport.use('okta', new OpenIDClientOktaStrategy());
        }
        if (oneLoginPassportStrategy) {
            passport.use('oneLogin', oneLoginPassportStrategy);
        }
        if (isAzureAdPassportStrategyAvailableToUse) {
            passport.use('azuread', await createAzureAdPassportStrategy());
        }
        if (isGenericOidcPassportStrategyAvailableToUse) {
            passport.use('oidc', await createGenericOidcPassportStrategy());
        }

        passport.serializeUser((user, done) => {
            // On login (user changes), user.userUuid is written to the session store in the `sess.passport.data` field
            done(null, {
                id: user.userUuid,
                organization: user.organizationUuid,
            });
        });

        // Before each request handler we read `sess.passport.user` from the session store
        passport.deserializeUser(
            async (
                passportUser: { id: string; organization: string },
                done,
            ) => {
                // Convert to a full user profile
                try {
                    done(null, await userService.findSessionUser(passportUser));
                } catch (e) {
                    done(e);
                }
            },
        );

        return expressApp;
    }

    private async initSlack() {
        const slackBot = this.slackBotFactory({
            lightdashConfig: this.lightdashConfig,
            analytics: this.analytics,
            serviceRepository: this.serviceRepository,
            models: this.models,
        });
        await slackBot.start();
    }

    private initSentry(expressApp: Express) {
        Sentry.init({
            release: VERSION,
            dsn: this.lightdashConfig.sentry.backend.dsn,
            environment:
                this.environment === 'development'
                    ? 'development'
                    : this.lightdashConfig.mode,
            integrations: [
                new Sentry.Integrations.Http({ tracing: true }),
                new Tracing.Integrations.Express({
                    app: expressApp,
                }),
            ],
            ignoreErrors: ['WarehouseQueryError', 'FieldReferenceError'],
            tracesSampler: (context: SamplingContext): boolean | number => {
                if (
                    context.request?.url?.endsWith('/status') ||
                    context.request?.url?.endsWith('/health') ||
                    context.request?.url?.endsWith('/favicon.ico') ||
                    context.request?.url?.endsWith('/robots.txt') ||
                    context.request?.url?.endsWith('livez') ||
                    context.request?.headers?.['user-agent']?.includes(
                        'GoogleHC',
                    )
                ) {
                    return 0.0;
                }
                return 0.2;
            },
            beforeBreadcrumb(breadcrumb) {
                if (
                    breadcrumb.category === 'http' &&
                    breadcrumb?.data?.url &&
                    new URL(breadcrumb?.data.url).host ===
                        new URL('https://hub.docker.com').host
                ) {
                    return null;
                }
                return breadcrumb;
            },
        });
        expressApp.use(
            Sentry.Handlers.requestHandler({
                user: [
                    'userUuid',
                    'organizationUuid',
                    'organizationName',
                    'email',
                ],
            }) as RequestHandler,
        );
        expressApp.use(Sentry.Handlers.tracingHandler());
    }

    private initSchedulerWorker() {
        this.schedulerWorker = this.schedulerWorkerFactory({
            lightdashConfig: this.lightdashConfig,
            analytics: this.analytics,
            serviceRepository: this.serviceRepository,
            models: this.models,
            clients: this.clients,
            utils: this.utils,
        });

        this.schedulerWorker.run().catch((e) => {
            Logger.error('Error starting scheduler worker', e);
        });
    }

    static initNodeProcessMonitor() {
        // Monitor Node.js process with opentelemetry
        registerNodeMetrics();
    }

    async stop() {
        if (this.schedulerWorker && this.schedulerWorker.runner) {
            try {
                await this.schedulerWorker.runner.stop();
                Logger.info('Stopped scheduler worker');
            } catch (e) {
                Logger.error('Error stopping scheduler worker', e);
            }
        }
        if (postHogClient) {
            try {
                await postHogClient.shutdownAsync();
                Logger.info('Stopped PostHog Client');
            } catch (e) {
                Logger.error('Error stopping PostHog Client', e);
            }
        }
        if (this.otelSdk) {
            try {
                await this.otelSdk.shutdown();
                Logger.info('Stopped OpenTelemetry SDK');
            } catch (e) {
                Logger.error('Error stopping OpenTelemetry SDK', e);
            }
        }
    }
}
