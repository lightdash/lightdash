import * as rudderAnalytics from 'rudder-sdk-js';

const isProd = process.env.NODE_ENV === 'production';
const writeKey = process.env.REACT_APP_RUDDERSTACK_WRITE_KEY;
const dataplaneUrl = process.env.REACT_APP_RUDDERSTACK_DATAPLANE_URL;

// Analytics is disabled by default unless rudderstack config is provided
if (isProd && writeKey && dataplaneUrl) {
    rudderAnalytics.load(writeKey, dataplaneUrl);
    // eslint-disable-next-line no-console
    rudderAnalytics.ready(() => console.log('Rudderstack ready'));
}

export { rudderAnalytics };
