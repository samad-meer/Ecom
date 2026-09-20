"""
Start the app exactly the way Passenger would, and show what happens.

    cPanel -> Setup Python App -> Execute python script:
      /home3/zipnixte/public_html/centuryy/ecom-app/tools/try_wsgi.py

Passenger imports the startup file and looks for a module-level `application`.
When that import raises, Passenger has nowhere to report it to a browser --
LiteSpeed just falls back to serving the folder, which is why the site shows a
directory index instead of an error. The traceback exists, it simply never
reaches anyone.

This runs that same import in the foreground so the traceback is printed. It
also does a real request through the WSGI callable, so a Django-level failure
(bad ALLOWED_HOSTS, unreachable database, missing dependency) surfaces here
rather than as a silent 404.

Read-only: no database writes, no files touched, credentials never printed.
"""

import os
import sys
import traceback

HOME = os.path.expanduser('~')
APP_ROOT = os.path.join(HOME, 'public_html', 'centuryy')
WSGI = os.path.join(APP_ROOT, 'passenger_wsgi.py')


def rule(title):
    print()
    print('=== ' + title + ' ' + '=' * max(0, 56 - len(title)))


rule('the startup file Passenger will import')
print('  path :', WSGI)
if not os.path.isfile(WSGI):
    print('  MISSING — Passenger has nothing to import. Stop here.')
    raise SystemExit(1)
print('  size :', os.path.getsize(WSGI), 'bytes')
print('  contents:')
for line in open(WSGI, errors='replace').read().split('\n'):
    print('    | ' + line)

rule('importing it, exactly as Passenger does')
sys.path.insert(0, APP_ROOT)
namespace = {'__file__': WSGI, '__name__': 'passenger_wsgi'}
application = None
try:
    exec(compile(open(WSGI).read(), WSGI, 'exec'), namespace)
    application = namespace.get('application')
    if application is None:
        print('  IMPORTED, but no `application` was defined.')
        print('  Passenger needs a module-level callable with that exact name.')
    else:
        print('  OK — `application` is', type(application).__name__)
except BaseException:
    print('  IMPORT FAILED. This is what Passenger hits and cannot report:')
    print()
    traceback.print_exc()

# ── A real request through the callable ─────────────────────────────────────
if application is not None:
    rule('a real GET /api/products/ through the app')
    from io import BytesIO

    environ = {
        'REQUEST_METHOD': 'GET',
        'PATH_INFO': '/api/products/',
        'SERVER_NAME': 'century.zipnixtechnologies.com',
        'SERVER_PORT': '443',
        'SERVER_PROTOCOL': 'HTTP/1.1',
        'HTTP_HOST': 'century.zipnixtechnologies.com',
        'wsgi.input': BytesIO(b''),
        'wsgi.errors': sys.stderr,
        'wsgi.url_scheme': 'https',
        'wsgi.multithread': False,
        'wsgi.multiprocess': True,
        'wsgi.run_once': False,
        'wsgi.version': (1, 0),
        'QUERY_STRING': '',
    }
    captured = {}

    def start_response(status, headers, exc_info=None):
        captured['status'] = status
        captured['headers'] = headers

    try:
        body = b''.join(application(environ, start_response))
        print('  status :', captured.get('status'))
        text = body.decode('utf-8', 'replace')
        print('  bytes  :', len(body))
        print('  body   :', text[:400].replace('\n', ' ')[:400])
        if captured.get('status', '').startswith('200'):
            print()
            print('  The app works. If the site still 404s, the request is not')
            print('  reaching Passenger — the app is stopped, or needs a restart.')
    except BaseException:
        print('  THE REQUEST RAISED:')
        print()
        traceback.print_exc()

# ── Whatever the host logged ────────────────────────────────────────────────
rule('recent entries in ~/logs')
LOGS = os.path.join(HOME, 'logs')
if os.path.isdir(LOGS):
    entries = []
    for name in os.listdir(LOGS):
        p = os.path.join(LOGS, name)
        if os.path.isfile(p):
            entries.append((os.path.getmtime(p), p, os.path.getsize(p)))
    for _, p, size in sorted(entries, reverse=True)[:6]:
        print('  %s  (%d bytes)' % (p, size))
        if size and ('error' in p.lower() or 'stderr' in p.lower()):
            try:
                with open(p, errors='replace') as fh:
                    tail = fh.readlines()[-12:]
                for line in tail:
                    print('    | ' + line.rstrip())
            except OSError:
                pass
else:
    print('  no ~/logs directory')

print()
print('Done. Nothing was modified.')
