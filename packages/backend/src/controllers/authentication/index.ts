// How a user makes authenticated requests
// 1. A cookie in the browser contains an encrypted cookie id
// 2. Every request from the frontend sends a cookie to the backend
// 3. express-session reads the cookie and looks up the cookie id in the sessions table in postgres
// 4. express-session attaches the data stored in the `sess` column in postgres to the request object `req.session`
// 5. Then passport looks for `req.session.passport.user` and passes the data to `deserializeUser`
// 6. `deserializeUser` translates `req.session.pasport.user` to a full user object and saves it on `req.user`

// How a user logs in
// 1. User sends login credentials to /login
// 2. passport.LocalStrategy compares the login details to data in postgres
// 3. passport.LocalStrategy creates a full user object and attaches it to `req.user`
// 4. `serializeUser` is called, which takes the full user object from `req.user`
// 5. `serializeUser` stores the user id on the request session `req.session.passport.user`
// 6. express-session saves the data on `req.session` to the session table in postgres under `sess`

// How a user links accounts with Google
// 1. User clicks button in frontend that opens /oauth/google/login - we also remember the page the user started on
// 2. passport.GoogleStrategy redirects the browser to Google where the user signs in to google and agrees to pass info to Lightdash
// 3. Google redirects the user to /oauth/google/callback with a secret token to show Lightdash that the user authenticated
// 4. passport.GoogleStrategy uses the token to send a request to Google to get the full profile information OpenIdUser
// 5. passport.GoogleStrategy compares the google details to data in postgres
// 6. passport.GoogleStrategy creates a full user object and attaches it to `req.user`
// 7. Follow steps 4-6 from "How a user is logs in"

export * from './middlewares';
export * from './strategies/apiKeyStrategy';
export * from './strategies/azureStrategy';
export * from './strategies/googleStrategy';
export * from './strategies/oidcStrategy';
export * from './strategies/oktaStrategy';
export * from './strategies/oneLoginStrategy';
export * from './strategies/passwordStrategy';
export * from './utils';
