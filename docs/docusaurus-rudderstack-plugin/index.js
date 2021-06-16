const path = require('path')

module.exports = function (context, options) {
    const { writeKey, dataplaneUrl } = options
    const isProd = process.env.NODE_ENV === 'production'
    return {
        name: 'docusaurus-rudderstack-plugin',
        getClientModules() {
            return isProd ? [path.resolve(__dirname, './rudderstack')] : []
        },
        injectHtmlTags() {
            if (!isProd || !writeKey || !dataplaneUrl)
                return {}
            return {
                headTags: [
                    {
                        tagName: 'script',
                        innerHTML: `
!function(){var e=window.rudderanalytics=window.rudderanalytics||[];e.methods=["load","page","track","identify","alias","group","ready","reset","getAnonymousId","setAnonymousId"],e.factory=function(t){return function(){var r=Array.prototype.slice.call(arguments);return r.unshift(t),e.push(r),e}};for(var t=0;t<e.methods.length;t++){var r=e.methods[t];e[r]=e.factory(r)}e.loadJS=function(e,t){var r=document.createElement("script");r.type="text/javascript",r.async=!0,r.src="https://cdn.rudderlabs.com/v1/rudder-analytics.min.js";var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(r,a)},e.loadJS(),
e.load("${writeKey}","${dataplaneUrl}"),
e.page()}();
                        `,
                    },
                ],
            }
        }
    }
}
