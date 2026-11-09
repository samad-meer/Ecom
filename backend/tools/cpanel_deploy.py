"""
Post-upload deploy step for the cPanel host, which has no SSH or Terminal.

Run it from cPanel -> Setup Python App -> "Execute python script".

    DRY RUN (safe, changes nothing - always start here):
        /home3/zipnixte/public_html/centuryy/tools/cpanel_deploy.py

    APPLY (runs migrate + collectstatic):
        /home3/zipnixte/public_html/centuryy/tools/cpanel_deploy.py apply

The dry run is the default on purpose. This field is easy to fire by accident,
and a migration that starts against a database nobody has backed up is not
something a default should be able to do.

Order matters and is fixed here: `migrate` before `collectstatic`, because a
failed migration should stop the deploy before anything else has been written.
"""

import os
import sys

APP_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPLY = "apply" in [a.lower() for a in sys.argv[1:]]


def rule(title):
    print("\n" + "=" * 62)
    print(title)
    print("=" * 62)


sys.path.insert(0, APP_ROOT)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

import django  # noqa: E402  - must follow the sys.path/env setup above

django.setup()

from django.conf import settings  # noqa: E402
from django.core.management import call_command  # noqa: E402
from django.db import connection  # noqa: E402
from django.db.migrations.executor import MigrationExecutor  # noqa: E402

rule("ENVIRONMENT")
print("app root      :", APP_ROOT)
print("django        :", django.get_version())
print("DEBUG         :", settings.DEBUG, "" if not settings.DEBUG else "  <-- MUST be False in production")
print("ALLOWED_HOSTS :", settings.ALLOWED_HOSTS)
print("db engine     :", settings.DATABASES["default"]["ENGINE"].rsplit(".", 1)[-1])
print("db name       :", settings.DATABASES["default"]["NAME"])
print("db host:port  :", settings.DATABASES["default"]["HOST"], settings.DATABASES["default"]["PORT"])
print("SECRET_KEY    :", "set" if settings.SECRET_KEY else "MISSING")

# Fail loudly rather than half-deploying against a database we cannot reach.
rule("DATABASE CONNECTION")
try:
    connection.ensure_connection()
    print("connected OK")
except Exception as exc:  # noqa: BLE001
    print("CANNOT CONNECT:", exc)
    print("\nCheck DB_ENGINE / DB_NAME / DB_USER / DB_PASSWORD / DB_PORT.")
    print("MySQL uses port 3306; 5432 is PostgreSQL.")
    sys.exit(1)

rule("PENDING MIGRATIONS")
executor = MigrationExecutor(connection)
plan = executor.migration_plan(executor.loader.graph.leaf_nodes())
if not plan:
    print("none - the database is already up to date")
else:
    print(f"{len(plan)} migration(s) will be applied, in this order:\n")
    for migration, _backwards in plan:
        print(f"   {migration.app_label}.{migration.name}")

# Read-only. Confirming an online payment posts a credit; with auto charge off
# the delivery it pays for was never charged, so the customer lands in credit.
rule("LEDGER SETTINGS")
try:
    from ledger.models import LedgerSettings

    cfg = LedgerSettings.objects.filter(pk=1).first()
    if cfg is None:
        print("no settings row yet - auto charge is OFF (the default)  <-- turn it on in admin")
    else:
        print("auto_charge_enabled :", cfg.auto_charge_enabled,
              "" if cfg.auto_charge_enabled else "  <-- turn it on in admin before confirming payments")
except Exception as exc:  # noqa: BLE001
    print("could not read ledger settings:", exc)

if not APPLY:
    rule("DRY RUN - NOTHING WAS CHANGED")
    print("Back up the database in phpMyAdmin first, then re-run with 'apply':")
    print(f"   {os.path.abspath(__file__)} apply")
    sys.exit(0)

rule("APPLYING MIGRATIONS")
try:
    call_command("migrate", interactive=False, verbosity=2)
except Exception as exc:  # noqa: BLE001
    print("\nMIGRATION FAILED:", exc)
    print("STOP. Do not re-run and do not use --fake.")
    print("Restore the database from the phpMyAdmin backup and send the error on.")
    sys.exit(1)

rule("COLLECTING STATIC FILES")
try:
    call_command("collectstatic", interactive=False, verbosity=1)
except Exception as exc:  # noqa: BLE001
    # Static files are cosmetic next to the schema - the migration already
    # succeeded, so report and carry on rather than implying a failed deploy.
    print("collectstatic failed (migrations DID apply):", exc)

rule("DONE")
print("Now press Restart on the Setup Python App page.")
