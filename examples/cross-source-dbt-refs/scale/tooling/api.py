import http.cookiejar
import json
import urllib.error
import urllib.parse
import urllib.request


class ApiError(Exception):
    pass


class Api:
    def __init__(self, base_url, project, cookie_jar):
        jar = http.cookiejar.MozillaCookieJar(str(cookie_jar))
        jar.load(ignore_discard=True, ignore_expires=True)
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        self.base = base_url.rstrip('/') + '/api/v1/projects/' + urllib.parse.quote(project, safe='')

    def request(self, method, path, body=None):
        request = urllib.request.Request(self.base + path,
                                         data=json.dumps(body).encode() if body is not None else None,
                                         headers={'Content-Type': 'application/json'}, method=method)
        try:
            with self.opener.open(request, timeout=300) as response:
                raw = response.read()
                payload = json.loads(raw) if raw else {}
                if payload and payload.get('status') != 'ok':
                    raise ApiError(f'{method} {path}: API status is not ok')
                return response.status, payload.get('results')
        except urllib.error.HTTPError as error:
            raise ApiError(f'{method} {path}: HTTP {error.code}') from None
        except (urllib.error.URLError, TimeoutError):
            raise ApiError(f'{method} {path}: connection failed') from None
