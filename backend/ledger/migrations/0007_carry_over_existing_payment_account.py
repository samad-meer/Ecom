"""
Move the single configured payment account onto the new PaymentAccount table.

The office's bank details lived as five flat fields on the LedgerSettings
singleton. Adding a table without carrying that row over would blank the
rider's Pay tab the moment this deploys, so the existing values become the
first PaymentAccount — same details, same QR file, no re-entry.

Reversible: the reverse copies the first account back onto the singleton, so
rolling this migration back does not lose the details either.
"""

from django.db import migrations


def carry_forward(apps, schema_editor):
    LedgerSettings = apps.get_model('ledger', 'LedgerSettings')
    PaymentAccount = apps.get_model('ledger', 'PaymentAccount')

    if PaymentAccount.objects.exists():
        return  # already carried over; never duplicate

    cfg = LedgerSettings.objects.first()
    if cfg is None:
        return

    # Nothing configured means nothing to carry — an empty card is worse than
    # the "not set up yet" message the clients already show.
    if not (cfg.payment_account_number or cfg.payment_account_title or cfg.payment_qr):
        return

    PaymentAccount.objects.create(
        bank_name=cfg.payment_bank_name or 'Bank',
        account_title=cfg.payment_account_title or '',
        # The old single field was documented as "account number or IBAN". A
        # value that looks like a Pakistani IBAN is filed as one so the new
        # split fields start out honest.
        account_number=(
            '' if _looks_like_iban(cfg.payment_account_number)
            else (cfg.payment_account_number or '')
        ),
        iban=(
            cfg.payment_account_number
            if _looks_like_iban(cfg.payment_account_number) else ''
        ),
        qr=cfg.payment_qr or None,
        instructions=cfg.payment_instructions or '',
        is_active=True,
        sort_order=0,
    )


def _looks_like_iban(value):
    cleaned = (value or '').replace(' ', '').upper()
    return len(cleaned) >= 20 and cleaned[:2].isalpha() and cleaned[2:4].isdigit()


def carry_back(apps, schema_editor):
    LedgerSettings = apps.get_model('ledger', 'LedgerSettings')
    PaymentAccount = apps.get_model('ledger', 'PaymentAccount')

    cfg = LedgerSettings.objects.first()
    account = PaymentAccount.objects.filter(is_active=True).order_by('sort_order', 'id').first()
    if cfg is None or account is None:
        return

    cfg.payment_bank_name = account.bank_name
    cfg.payment_account_title = account.account_title
    cfg.payment_account_number = account.account_number or account.iban
    cfg.payment_qr = account.qr or None
    cfg.payment_instructions = account.instructions
    cfg.save()


class Migration(migrations.Migration):

    dependencies = [
        ('ledger', '0006_payment_accounts'),
    ]

    operations = [
        migrations.RunPython(carry_forward, carry_back),
    ]
