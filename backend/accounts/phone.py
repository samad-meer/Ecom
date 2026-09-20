"""
One canonical form for a Pakistani mobile number, and the duplicate lookup
built on it.

A number reaches us typed four different ways depending on who is entering it —
the customer on the signup form, an admin adding a walk-in, an import from the
old system. `0300-1234567`, `+92 300 1234567`, `92 300 1234567` and
`03001234567` are one person, and until they collapse to one string no
duplicate check can see that.

Kept free of DRF and of model imports at module scope so a data migration can
use it: `accounts.serializers` wraps `normalize_phone` in the validator that
raises, and the historical migration calls it directly.
"""

import re

# Anything a human puts between the digits.
_SEPARATORS = re.compile(r'[\s\-().]')
# Local (03xx), international (+923xx) and the bare country code (923xx).
_PATTERN = re.compile(r'^(?:\+92|92|0)3\d{9}$')


def normalize_phone(value):
    """
    Return the number as `03xxxxxxxxx`, or None if it is not a valid mobile.

    None rather than an exception because two of the three callers have
    something better to do than fail: the admin form reports it as a field
    error, and the backfill migration leaves unparseable legacy values alone
    rather than destroying them.
    """
    cleaned = _SEPARATORS.sub('', value or '')
    if not _PATTERN.match(cleaned):
        return None
    # The last 10 digits are the number; the prefix is just how it was written.
    return '0' + cleaned[-10:]


def customer_with_phone(phone, exclude_user_id=None):
    """
    The existing customer holding this number, or None.

    Scoped to customers on purpose. Staff and riders carry phone numbers too,
    and a rider who also buys water is not a duplicate — blocking that would
    invent a problem nobody has.

    `exclude_user_id` is for edits, so a customer saving their own profile does
    not collide with themselves.
    """
    from accounts.models import UserProfile  # circular at module scope

    if not phone:
        return None
    matches = UserProfile.objects.filter(
        phone_number=phone, user_type='customer',
    ).select_related('user')
    if exclude_user_id is not None:
        matches = matches.exclude(user_id=exclude_user_id)
    return matches.first()


def duplicate_phone_error(phone, exclude_user_id=None):
    """
    A ready-made field error when `phone` is already taken, else None.

    The existing customer's name and id ride along so the admin UI can offer to
    open that record instead of making the operator go and search for it.
    """
    existing = customer_with_phone(phone, exclude_user_id=exclude_user_id)
    if existing is None:
        return None
    name = existing.user.get_full_name() or existing.user.username
    message = f'This number already belongs to {name}.'
    return {
        # Both clients look for `detail` before falling back to guessing which
        # key holds the human-readable half, so the operator sees the sentence
        # rather than a dump of the payload below it.
        'detail': message,
        'phone_number': message,
        'existing_customer': {
            'id': existing.user_id,
            'name': name,
            'username': existing.user.username,
        },
    }
