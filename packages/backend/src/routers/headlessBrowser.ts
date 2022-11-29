import express from 'express';

const puppeteer = require('puppeteer');

export const headlessBrowserRouter = express.Router({ mergeParams: true });

// Extra endpoints for headless-chrome testing on Render
if (process.env.IS_PULL_REQUEST === 'true') {
    headlessBrowserRouter.get('/callback/:flag', async (req, res, next) => {
        // Returns json with the same argument specified in flag
        // Wait a random number of seconds between 0 an 1, to ensure the response can overlap with other requests.
        const delay = Math.floor(Math.random() * 1000);
        setTimeout(() => {
            res.json({
                flag: req.params.flag,
                delay,
            });
        }, delay);
    });

    headlessBrowserRouter.get('/test/:flag', async (req, res, next) => {
        let browser;

        try {
            const browserWSEndpoint = `ws://${process.env.HEADLESS_BROWSER_HOST}:${process.env.HEADLESS_BROWSER_PORT}`;
            console.debug(`Headless chrome endpoint: ${browserWSEndpoint}`);
            browser = await puppeteer.connect({
                browserWSEndpoint,
            });

            const page = await browser.newPage();
            const hostname =
                process.env.NODE_ENV === 'development'
                    ? 'lightdash-dev'
                    : 'lightdash';

            const testUrl = `http://${hostname}:${
                process.env.PORT || 3000
            }/api/v1/headless-browser/callback/${req.params.flag}`;
            console.debug(`Fetching headless chrome URL: ${testUrl}`);

            const response = await page.goto(testUrl, {});
            const result = await response.json();

            res.json({
                response: result,
                request: {
                    flag: req.params.flag,
                    browser: browserWSEndpoint,
                    url: testUrl,
                },
            });
        } catch (e) {
            console.error(e);
            next(e.message);
        } finally {
            if (browser) await browser.close();
        }
    });
}
