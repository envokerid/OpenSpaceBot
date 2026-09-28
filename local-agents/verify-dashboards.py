#!/usr/bin/env python3
"""Exercise isolated dashboard servers; never use the installed user state."""
import json
import os
from pathlib import Path
import secrets
import signal
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def request(port, path, data=None, headers=None):
    req = urllib.request.Request(
        f'http://127.0.0.1:{port}{path}',
        data=json.dumps(data).encode() if data is not None else None,
        headers={'Content-Type': 'application/json', **(headers or {})},
    )
    try:
        response = urllib.request.urlopen(req, timeout=3)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.read()


def main():
    processes = []
    logs = []
    with tempfile.TemporaryDirectory(prefix='local-agents-smoke-') as temporary:
        fixture = Path(temporary)
        print(f'Isolated fixture: {fixture}', flush=True)
        env = {key: value for key, value in os.environ.items()
               if key in {'PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'XDG_RUNTIME_DIR'}}
        hport, oport = free_port(), free_port()
        hhome = fixture / 'hermes'
        hhome.mkdir()
        password = secrets.token_urlsafe(24)
        origin = 'https://fixture.invalid:9444'
        (hhome / 'config.yaml').write_text(json.dumps({
            'cli': {'expose_on_path': False},
            'dashboard': {'public_url': origin, 'basic_auth': {
                'username': 'fixture', 'password': password,
                'secret': secrets.token_urlsafe(40)}},
        }))
        # Copy-on-write dependency generations keep PM leases and selection
        # metadata isolated too. The separately pinned tool binaries are shared.
        source_installs = ROOT / 'hermes/state/installs'
        subprocess.run(['cp', '-a', '--reflink=auto', str(source_installs),
                        str(hhome / 'installs')], check=True)
        for target in (hhome / 'installs').glob('*/facts.json'):
            target.write_text(target.read_text().replace(str(source_installs), str(hhome / 'installs')))
        henv = {**env, 'HERMES_HOME': str(hhome),
                'HERMES_RUNTIME_DIR': str(ROOT / 'hermes/state/tools'),
                'HERMES_DISABLE_LAZY_INSTALLS': '1'}
        ohome = fixture / 'openclaw'
        ohome.mkdir()
        oconfig = ohome / 'openclaw.json'
        oorigin = 'https://fixture.invalid:9443'
        oconfig.write_text(json.dumps({
            'gateway': {'mode': 'local', 'bind': 'loopback', 'port': oport,
                'trustedProxies': ['127.0.0.1', '::1'],
                'controlUi': {'allowedOrigins': [oorigin]},
                'auth': {'mode': 'trusted-proxy',
                    'identityScopes': {'fixture@example.test': ['operator.admin']},
                    'trustedProxy': {'userHeader': 'tailscale-user-login',
                        'allowLoopback': True, 'allowUsers': ['fixture@example.test'],
                        'requiredHeaders': ['x-forwarded-proto'],
                        'deviceAutoApprove': {'enabled': True}}}},
            'browser': {'enabled': False},
            'discovery': {'mdns': {'mode': 'off'}},
            'agents': {'defaults': {'workspace': str(ohome / 'workspace')}},
        }))
        oenv = {**env, 'OPENCLAW_STATE_DIR': str(ohome),
                'OPENCLAW_HOME': str(ohome), 'OPENCLAW_CONFIG_PATH': str(oconfig)}
        commands = [
            ('hermes-dashboard', [str(ROOT / 'hermes/source/.hermes/bin/hermes'),
              'dashboard', '--isolated', '--skip-build', '--no-open',
              '--host', '127.0.0.1', '--port', str(hport)], henv),
            ('hermes-gateway', [str(ROOT / 'hermes/source/.hermes/bin/hermes'),
              'gateway', 'run', '--external-supervisor'], henv),
            ('openclaw', [str(ROOT / 'openclaw/runtime/bin/openclaw'),
              'gateway', 'run'], oenv),
        ]
        try:
            for name, command, child_env in commands:
                log = open(fixture / f'{name}.log', 'w+')
                logs.append((name, log))
                processes.append(subprocess.Popen(command, env=child_env,
                    cwd=fixture, stdout=log, stderr=subprocess.STDOUT, start_new_session=True))
            for port, path in [(hport, '/api/status'), (oport, '/healthz')]:
                deadline = time.monotonic() + 90
                while True:
                    if any(p.poll() is not None for p in processes):
                        raise RuntimeError('A fixture process exited before readiness')
                    try:
                        code, body = request(port, path)
                        if code == 200:
                            break
                    except OSError:
                        pass
                    if time.monotonic() > deadline:
                        raise TimeoutError(f'Fixture port {port} did not become ready')
                    time.sleep(0.5)
            status = json.loads(request(hport, '/api/status')[1])
            assert status['auth_required'] and 'basic' in status['auth_providers'], status
            assert request(hport, '/api/config')[0] == 401
            headers = {'Origin': origin, 'Host': 'fixture.invalid:9444',
                       'X-Forwarded-Proto': 'https'}
            bad = {'provider': 'basic', 'username': 'fixture', 'password': 'incorrect'}
            assert request(hport, '/auth/password-login', bad, headers)[0] == 401
            assert request(hport, '/auth/password-login', {**bad, 'password': password}, headers)[0] == 200
            print('PASS Hermes: authenticated dashboard, bad-password rejection, gateway alive', flush=True)
            from websockets.sync.client import connect
            def handshake(user):
                headers = {'X-Forwarded-For': '100.64.0.10', 'X-Forwarded-Proto': 'https',
                           'X-Forwarded-Host': 'fixture.invalid:9443'}
                if user:
                    headers['Tailscale-User-Login'] = user
                with connect(f'ws://127.0.0.1:{oport}/', origin=oorigin,
                             additional_headers=headers, open_timeout=10) as ws:
                    json.loads(ws.recv(timeout=10))
                    ws.send(json.dumps({'type': 'req', 'id': 'smoke', 'method': 'connect',
                        'params': {'minProtocol': 4, 'maxProtocol': 4,
                            'client': {'id': 'openclaw-control-ui', 'version': 'smoke',
                                       'platform': 'web', 'mode': 'ui'},
                            'role': 'operator', 'scopes': ['operator.read']}}))
                    while True:
                        response = json.loads(ws.recv(timeout=10))
                        if response.get('id') == 'smoke':
                            return response
            deadline = time.monotonic() + 60
            while True:
                result = handshake('fixture@example.test')
                if result.get('error', {}).get('code') != 'UNAVAILABLE':
                    break
                if time.monotonic() > deadline:
                    raise TimeoutError('OpenClaw sidecars did not become ready')
                time.sleep(0.5)
            assert result['ok'], result
            rejected = handshake('wrong@example.test')
            assert not rejected['ok'] and rejected['error']['code'] != 'UNAVAILABLE', rejected
            print('PASS OpenClaw: dashboard WebSocket accepts owner and rejects other identities', flush=True)
        except BaseException:
            for name, log in logs:
                log.flush()
                log.seek(0)
                print(f'--- {name} ---\n{log.read()[-6000:]}', flush=True)
            raise
        finally:
            for process in processes:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
            for process in processes:
                try:
                    process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
            for _, log in logs:
                log.close()


if __name__ == '__main__':
    main()
