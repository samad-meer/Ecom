"""
Apply pending database migrations, from cPanel, with no shell.

    cPanel -> Setup Python App -> Execute python script:
      /home3/zipnixte/public_html/centuryy/ecom-app/tools/run_migrations.py

This host has no SSH, so `manage.py migrate` cannot be typed anywhere. This is
that command, in a form the Execute-python-script box can run.

It prints the plan first and then applies it — there is no preview mode,
because a migration that is listed but not applied leaves the database in the
state that caused the problem. Django's migrations are individually atomic on
MySQL/InnoDB for schema operations, and the data migrations here are written to
be idempotent, so re-running after a failure is safe.

WHAT IS PENDING AS OF THIS DEPLOY
  accounts 0020  normalise every stored phone number to 03xxxxxxxxx
  accounts 0021  copy each customer's signup address into their address book,
                 so checkout stops telling them they have none
  ledger   0006  the payment_accounts table
  ledger   0007  carry the old single payment account onto it
  ledger   0008  seed the Meezan Bank account
  localization 0004  the Urdu master switch
  activities   0002  the 'data' and 'settings' activity categories
"""

import os
import sys

def _find_app_root():
    """Walk up from this file until manage.py appears.

    Hardcoding "the parent directory" assumed this script sits in tools/. It
    now works whether it is dropped in tools/ or straight into the app root,
    which is one less thing to get wrong through a File Manager.
    """
    here = os.path.dirname(os.path.abspath(__file__))
    for _ in range(4):
        if os.path.isfile(os.path.join(here, 'manage.py')):
            return here
        parent = os.path.dirname(here)
        if parent == here:
            break
        here = parent
    return None


APP_ROOT = _find_app_root()
if APP_ROOT is None:
    print('Could not find manage.py near this script.')
    print('Put it in the Django app root (the folder holding manage.py),')
    print('or in tools/ inside it, and run it again.')
    raise SystemExit(1)

if APP_ROOT not in sys.path:
    sys.path.insert(0, APP_ROOT)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

import django  # noqa: E402

django.setup()

from django.core.management import call_command  # noqa: E402
from django.db import connection  # noqa: E402
from django.db.migrations.executor import MigrationExecutor  # noqa: E402


def pending():
    """Everything Django would apply, as (app, name) pairs."""
    executor = MigrationExecutor(connection)
    targets = executor.loader.graph.leaf_nodes()
    return [(m.app_label, m.name) for m, _ in executor.migration_plan(targets)]


def main():
    print('=' * 62)
    print('  APPLYING DATABASE MIGRATIONS')
    print('=' * 62)
    print('app root :', APP_ROOT)
    print('database :', connection.settings_dict.get('NAME'))
    print()

    before = pending()
    if not before:
        print('Nothing to apply — the database is already up to date.')
        return

    print('%d migration(s) to apply:' % len(before))
    for app, name in before:
        print('   %-14s %s' % (app, name))
    print()

    call_command('migrate', interactive=False, verbosity=2)

    after = pending()
    print()
    if after:
        print('STILL PENDING (%d) — something failed above:' % len(after))
        for app, name in after:
            print('   %-14s %s' % (app, name))
        print()
        print('Read the traceback, fix it, and run this again. The migrations')
        print('that did apply are recorded, so nothing is repeated.')
    else:
        print('All migrations applied. The database is up to date.')
        print()
        print('Two of these changed data, not just schema:')
        print('  ledger 0008    seeded the Meezan Bank payment account')
        print('  accounts 0021  gave existing customers their address book entry')


main()
