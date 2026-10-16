import http.cookiejar
import os
import tempfile
from pathlib import Path
import json
import urllib.error
import urllib.parse
import urllib.request


class ApiError(Exception):
    pass


class Api:
    def __init__(self, base_url, project, cookie_jar):
        cookies = []
        for line in Path(cookie_jar).read_text().splitlines():
            fields = line.replace('#HttpOnly_', '').split('\t')
            if len(fields) == 7 and not fields[0].startswith('#'):
                cookies.append(f'{fields[5]}={fields[6]}')
        self.cookie_header = '; '.join(cookies)
        self.opener = urllib.request.build_opener()
        self.base = base_url.rstrip('/') + '/api/v1/projects/' + urllib.parse.quote(project, safe='')

    def request(self, method, path, body=None):
        request = urllib.request.Request(self.base + path,
                                         data=json.dumps(body).encode() if body is not None else None,
                                         headers={'Content-Type': 'application/json', 'Cookie': self.cookie_header}, method=method)
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
