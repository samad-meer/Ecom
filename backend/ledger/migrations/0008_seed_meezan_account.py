"""
Seed the business's Meezan Bank account.

The office has exactly one account today and it is the same on every
environment, so requiring someone to retype it into a fresh deployment is a
step that will eventually be forgotten — and a rider with no account to show is
a customer who cannot pay by transfer.

Idempotent by account identity, not by "is the table empty": migration 0007 may
already have carried an account over from the old LedgerSettings fields, and
this must neither duplicate Meezan nor skip it just because some other account
happens to exist.

No QR is set here. The image cannot travel in a migration, and the account
number and IBAN alone are enough to take a transfer; upload the QR from the
admin panel and it appears on the rider's Pay tab alongside these details.
"""

from django.db import migrations

MEEZAN = {
    'bank_name': 'Meezan Bank',
    'account_title': 'Century Sip',
    'account_number': '0258 0108357297',
    'iban': 'PK13MEZN0002580108357297',
    'instructions': 'Please share the payment screenshot.',
    'is_active': True,
    'sort_order': 0,
}


def seed(apps, schema_editor):
    PaymentAccount = apps.get_model('ledger', 'PaymentAccount')

    # Match on either identifier: 0007 may have filed the same account under
    # the account number alone, since the old single field held one or other.
    already_there = PaymentAccount.objects.filter(iban=MEEZAN['iban']).exists() or (
        PaymentAccount.objects
        .filter(account_number=MEEZAN['account_number'])
        .exists()
    )
    if already_there:
        return

    PaymentAccount.objects.create(**MEEZAN)


def unseed(apps, schema_editor):
    """Remove only the row this migration created, leaving anything the office
    added by hand alone."""
    PaymentAccount = apps.get_model('ledger', 'PaymentAccount')
    PaymentAccount.objects.filter(
        iban=MEEZAN['iban'], account_number=MEEZAN['account_number'],
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('ledger', '0007_carry_over_existing_payment_account'),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
