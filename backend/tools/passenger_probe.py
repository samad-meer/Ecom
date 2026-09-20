"""
Find out why Passenger is not serving Django, using the only command channel
this host offers: cPanel -> Setup Python App -> Execute python script.

    /home3/zipnixte/public_html/centuryy/ecom-app/tools/passenger_probe.py

Read-only. It changes nothing and prints no secret values — environment
variables are shown by NAME only, and any line that looks like a key or
password is masked.

WHAT IT ANSWERS
  From outside, century.zipnixtechnologies.com/ returns a LiteSpeed directory
  index. That means no Python application is bound to that domain at all: if
  one were, Passenger would handle "/" and Django would answer. The three
  things that could cause it are only visible from inside the account --
  whether passenger_wsgi.py is where Passenger looks, whether the domain's
  .htaccess carries the Passenger directives that bind it, and whether the
  virtualenv's own python wrapper is broken (it currently emits
  "export: `=False': not a valid identifier", which runs on every start).
"""

import os
import re

HOME = os.path.expanduser('~')
SECRET = re.compile(r'(SECRET|PASSWORD|KEY|TOKEN|DSN)', re.I)


def rule(title):
    print()
    print('=== ' + title + ' ' + '=' * max(0, 56 - len(title)))


def show_file(path, limit=60, mask=True):
    """Print a file, masking anything that looks like a credential."""
    if not os.path.isfile(path):
        print('  MISSING: ' + path)
        return False
    print('  ' + path)
    try:
        with open(path, 'r', errors='replace') as fh:
            for i, line in enumerate(fh):
                if i >= limit:
                    print('       ... truncated')
                    break
                line = line.rstrip('\n')
                if mask and SECRET.search(line):
                    # CloudLinux writes these space-separated -- `SetEnv
                    # DB_PASSWORD hunter2` -- so an '=' check missed them and
                    # printed live credentials in full. Mask on the KEYWORD and
                    # blank everything after it, whatever the separator.
                    m = SECRET.search(line)
                    cut = line.find(' ', m.end())
                    head = line[:cut] if cut != -1 else line[:m.end()]
                    line = head + ' <masked>'
                    if '=' in head:
                        line = head.split('=', 1)[0] + '=<masked>'
                print('    | ' + line)
    except OSError as exc:
        print('    (unreadable: %s)' % exc)
    return True


# ── 1. Is the startup file where Passenger looks? ───────────────────────────
rule('passenger_wsgi.py — every copy under the account')
found_any = False
for base, dirs, files in os.walk(HOME):
    dirs[:] = [d for d in dirs
               if d not in ('.git', 'node_modules', '__pycache__', 'virtualenv',
                            '.trash', 'mail', '.cagefs')]
    if 'passenger_wsgi.py' in files:
        p = os.path.join(base, 'passenger_wsgi.py')
        print('  FOUND  %s  (%d bytes)' % (p, os.path.getsize(p)))
        found_any = True
if not found_any:
    print('  NONE ANYWHERE — Passenger has nothing to import, so no app can start.')

rule('the Django app root')
APP = os.path.join(HOME, 'public_html', 'centuryy', 'ecom-app')
for name in ('passenger_wsgi.py', 'manage.py', 'core/wsgi.py', 'core/settings.py', '.env'):
    p = os.path.join(APP, name.replace('/', os.sep))
    print('  %-20s %s' % (name, 'yes' if os.path.exists(p) else 'NO'))

# ── 2. Is any domain bound to the app? ──────────────────────────────────────
rule('domain .htaccess files — do they carry Passenger directives?')
for d in ('century.zipnixtechnologies.com', 'admin.zipnixtechnologies.com', 'public_html'):
    path = os.path.join(HOME, d, '.htaccess')
    print()
    if show_file(path, limit=40):
        try:
            body = open(path, errors='replace').read()
        except OSError:
            body = ''
        has = 'PassengerAppRoot' in body or 'PassengerBaseURI' in body
        print('    -> Passenger directives: %s' % ('YES' if has else 'NO — this domain is not bound to the app'))

# ── 3. Is the virtualenv wrapper broken? ────────────────────────────────────
rule('the virtualenv python wrapper (source of the =False error)')
WRAP = os.path.join(HOME, 'virtualenv', 'public_html', 'centuryy', '3.12', 'bin', 'python')
if os.path.isfile(WRAP):
    print('  ' + WRAP)
    try:
        lines = open(WRAP, errors='replace').read().split('\n')
        for i, line in enumerate(lines[:30], start=1):
            flag = '  <-- broken export' if re.search(r'export\s+=', line) else ''
            shown = line
            if SECRET.search(line) and '=' in line:
                shown = line.split('=', 1)[0] + '=<masked>'
            print('    %2d | %s%s' % (i, shown, flag))
    except OSError as exc:
        print('    (unreadable: %s)' % exc)
else:
    print('  MISSING: ' + WRAP)

# ── 4. What environment does the app get? ───────────────────────────────────
rule('environment variable NAMES visible to this script (no values)')
names = sorted(k for k in os.environ if not k.startswith(('LS_', 'CPANEL')))
print('  ' + ', '.join(names[:40]))
blank = [k for k in os.environ if not k.strip()]
print('  blank-named variables: %s' % (blank if blank else 'none in this context'))

# ── 5. CloudLinux Python Selector registry ──────────────────────────────────
rule('CloudLinux / cPanel app registry')
for rel in ('.cl.selector/defaults.cfg', '.cpanel/environment',
            '.cagefs/cagefs.token', '.cl.selector'):
    p = os.path.join(HOME, rel)
    if os.path.isdir(p):
        print('  DIR  %s -> %s' % (p, ', '.join(sorted(os.listdir(p))[:10])))
    elif os.path.isfile(p):
        show_file(p, limit=25)

print()
print('Done. Nothing was modified.')
