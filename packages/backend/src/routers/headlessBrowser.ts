import { ForbiddenError } from '@lightdash/common';
import { createHmac } from 'crypto';
import express from 'express';
import { lightdashConfig } from '../config/lightdashConfig';
import { userModel } from '../models/models';
import { EncryptionService } from '../services/EncryptionService/EncryptionService';

const puppeteer = require('puppeteer');

export const headlessBrowserRouter = express.Router({ mergeParams: true });
export const encryptionService = new EncryptionService({ lightdashConfig });

export const getAuthenticationToken = (value: string) =>
    createHmac('sha512', lightdashConfig.lightdashSecret)
        .update(value)
        .digest('hex');
headlessBrowserRouter.post('/login/:userUuid', async (req, res, next) => {
    try {
        const { userUuid } = req.params;
        const hash = getAuthenticationToken(userUuid);

        if (hash !== req.body.token) {
            throw new ForbiddenError();
        }
        const sessionUser = await userModel.findSessionUserByUUID(userUuid);

        req.login(sessionUser, (err) => {
            if (err) {
                next(err);
            }
            res.json({
                status: 'ok',
                results: sessionUser,
            });
        });
    } catch (e) {
        next(e);
    }
});

// Extra endpoints for headless-chrome testing on Render
if (
    process.env.NODE_ENV === 'development' ||
    process.env.IS_PULL_REQUEST === 'true'
) {
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
                    : process.env.RENDER_SERVICE_NAME;

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

    headlessBrowserRouter.get('/image/', async (req, res, next) => {
        let browser;

        const url =
            'http://lightdash-dev:3000/projects/3675b69e-8324-4110-bdca-059031aa8da3/dashboards/07914c8f-4dd5-41de-ae48-62f2c711b667/view';
        // const url ='http://lightdash-dev:3000/projects/3675b69e-8324-4110-bdca-059031aa8da3/saved/7688b558-3c17-4b96-8f55-af7755be9f12/';
        try {
            const browserWSEndpoint = `ws://${process.env.HEADLESS_BROWSER_HOST}:${process.env.HEADLESS_BROWSER_PORT}`;
            console.debug(`Headless chrome endpoint: ${browserWSEndpoint}`);
            browser = await puppeteer.connect({
                browserWSEndpoint,
            });

            const page = await browser.newPage();
            await page.setExtraHTTPHeaders({
                cookie: req.headers.cookie || '',
            });

            await page.setViewport({
                width: 1400,
                height: 768, // hardcoded
            });

            const blockedUrls = [
                'headwayapp.co',
                'rudderlabs.com',
                'analytics.lightdash.com',
                'cohere.so',
                'intercom.io',
            ];
            await page.setRequestInterception(true);
            page.on('request', (request: any) => {
                const requestUrl = request.url();
                if (blockedUrls.includes(requestUrl)) {
                    request.abort();
                    return;
                }

                request.continue();
            });
            await page.goto(url, {
                timeout: 100000,
                waitUntil: 'networkidle0',
            });

            await page.waitForSelector('.react-grid-layout');
            const element = await page.$('.react-grid-layout');

            await page.evaluate((sel: any) => {
                // @ts-ignore
                const elements = document.querySelectorAll(sel);
                elements.forEach((el) => el.parentNode.removeChild(el));
            }, '.bp4-navbar');

            const imageBuffer = await element.screenshot({
                path: '/tmp/test-screenshot.png',
            });

            res.writeHead(200, {
                'Content-Type': 'image/png',
                'Content-Length': imageBuffer.length,
            });
            res.end(imageBuffer);
        } catch (e) {
            console.error(e);
            next(e.message);
        } finally {
            if (browser) await browser.close();
        }
    });
}
