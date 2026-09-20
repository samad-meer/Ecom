"""
Give every existing customer the address they already typed.

Signup wrote the address onto the profile but never created an address-book
entry, and checkout reads the address book. So a customer who supplied their
full address at registration — house number, portion, block, area, and any pin
they dropped — arrived at checkout, was told "You have no saved addresses yet",
and had to type all of it again before they could order.

Signup now creates that entry. This does the same for everyone who registered
before it did.

Deliberately conservative:
  - Only customers with an EMPTY address book are touched. Anyone who has
    already added addresses has made their own choices and is left alone.
  - Only profiles that actually hold an address are carried over; an empty
    entry would be worse than none, because checkout would offer a blank card.
  - Marked default, since it is their only address and checkout pre-selects it.
"""

from django.db import migrations


def backfill(apps, schema_editor):
    UserProfile = apps.get_model('accounts', 'UserProfile')
    CustomerAddress = apps.get_model('accounts', 'CustomerAddress')

    have_addresses = set(
        CustomerAddress.objects.values_list('user_id', flat=True).distinct()
    )

    new_rows = []
    profiles = (
        UserProfile.objects
        .filter(user_type='customer')
        .exclude(user_id__in=have_addresses)
        .select_related('user')
    )
    for profile in profiles:
        # An address the rider could not act on is not worth carrying.
        if not ((profile.house_number or '').strip() or (profile.address or '').strip()):
            continue

        new_rows.append(CustomerAddress(
            user_id=profile.user_id,
            label='home',
            house_number=(profile.house_number or '').strip(),
            portion=(profile.portion or '').strip(),
            block=(profile.block or '').strip(),
            area=(profile.area or '').strip(),
            address=(profile.address or '').strip(),
            latitude=profile.customer_latitude,
            longitude=profile.customer_longitude,
            is_default=True,
        ))

    if new_rows:
        CustomerAddress.objects.bulk_create(new_rows, batch_size=500)


def unbackfill(apps, schema_editor):
    """No reverse. These rows are indistinguishable from ones a customer added
    by hand, and deleting the wrong one would lose an address the customer
    entered themselves — a far worse outcome than leaving a duplicate."""


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0020_normalize_phone_numbers'),
    ]

    operations = [
        migrations.RunPython(backfill, unbackfill),
    ]
