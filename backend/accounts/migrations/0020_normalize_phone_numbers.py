"""
Rewrite every stored phone number into the canonical 03xxxxxxxxx form.

Until now only the signup form normalised. Admin-entered customers kept
whatever was typed — '0300-1234567', '+92 300 1234567' — so the same person
recorded through the two doors did not compare equal, and the duplicate check
added alongside this migration would have looked straight past them.

Runs as a migration rather than a management command because the production
host has no shell: migrations are applied as part of the normal deploy, a
command would have to be run by hand and would quietly never happen.

Deliberately conservative — a value that does not parse as a mobile number is
left exactly as it is. Landlines, '0000', 'ask at gate' and blanks are all real
things in this column, and destroying them to satisfy a format would lose data
the office still uses.
"""

from django.db import migrations


def normalize(apps, schema_editor):
    from accounts.phone import normalize_phone

    UserProfile = apps.get_model('accounts', 'UserProfile')

    changed = []
    for profile in UserProfile.objects.exclude(
        phone_number__isnull=True,
    ).exclude(phone_number='').only('id', 'phone_number'):
        canonical = normalize_phone(profile.phone_number)
        if canonical and canonical != profile.phone_number:
            profile.phone_number = canonical
            changed.append(profile)

    if changed:
        UserProfile.objects.bulk_update(changed, ['phone_number'], batch_size=500)


def noop(apps, schema_editor):
    """No reverse: the original spellings are not recoverable, and there is no
    behaviour that wants them back."""


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0019_userprofile_work_place_label'),
    ]

    operations = [
        migrations.RunPython(normalize, noop),
    ]
