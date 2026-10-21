import contextlib
import http.client
import json
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

from fixtures import WORK


@contextlib.contextmanager
def trust_git(server):
    key = f'http.https://localhost:{server.port}/.sslCAInfo'
    base = ['/usr/bin/git', 'config', '--file', str(WORK / 'gitconfig')]
    existing = subprocess.run([*base, '--get-all', key], capture_output=True, text=True)
    if existing.returncode not in [0, 1] or existing.stdout:
        raise RuntimeError('Private fixture CA setting already exists')
    subprocess.run([*base, key, str(server.cert_path)], check=True)
    try:
        yield
    finally:
        subprocess.run([*base, '--unset-all', key], check=True, capture_output=True)


def packages(value):
    if isinstance(value, dict):
        own = {value['dbtPackageName']} if isinstance(value.get('dbtPackageName'), str) else set()
        return own.union(*(packages(item) for item in value.values()))
    if isinstance(value, list):
        return set().union(*(packages(item) for item in value))
    return set()


@contextlib.contextmanager
def observe_http(url):
    target = urlsplit(url)
    events = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def forward(self):
            body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
            headers = {key: value for key, value in self.headers.items()
                       if key.lower() not in ['host', 'connection', 'transfer-encoding']}
            connection = http.client.HTTPConnection(target.hostname, target.port, timeout=120)
            try:
                connection.request(self.command, self.path, body=body, headers=headers)
                response = connection.getresponse()
                raw = response.read()
                try:
                    payload = json.loads(body) if body else None
                except (ValueError, UnicodeDecodeError):
                    payload = None
                events.append({'http_status': response.status, 'method': self.command, 'path': self.path,
                    'message': raw.decode(errors='replace') if response.status >= 400 else '',
                    'request_body': payload if self.path.endswith('/parameters') else None,
                    'request_keys': sorted(payload) if isinstance(payload, dict) else [],
                    'dbt_packages': sorted(packages(payload))})
                self.send_response(response.status)
                for key, value in response.getheaders():
                    if key.lower() not in ['content-length', 'transfer-encoding', 'connection']:
                        self.send_header(key, value)
                self.send_header('Content-Length', str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)
            finally:
                connection.close()

        do_GET = forward
        do_POST = forward
        do_PUT = forward
        do_PATCH = forward
        do_DELETE = forward

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f'http://127.0.0.1:{server.server_port}', events
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
