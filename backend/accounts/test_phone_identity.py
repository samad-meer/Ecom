"""
One phone number means one customer, however it was typed and whichever door
it came through.

The two creation paths used to disagree: signup normalised, the admin form
stored raw. So the same person entered by an admin and then signing up for the
app became two accounts with two ledgers — and the balance was on the one the
customer could not see.
"""

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status as http
from rest_framework.test import APIClient

from .phone import customer_with_phone, normalize_phone


class NormalizePhoneTests(TestCase):
    """Every spelling of one number collapses to the same string."""

    def test_all_spellings_agree(self):
        for written in (
            '03001234567',
            '0300-1234567',
            '0300 1234567',
            '+923001234567',
            '+92 300 1234567',
            '92 300 1234567',
            '(0300) 123-4567',
        ):
            with self.subTest(written=written):
                self.assertEqual(normalize_phone(written), '03001234567')

    def test_rubbish_is_left_for_the_caller_to_handle(self):
        for written in ('', None, 'ask at gate', '12345', '0421234567'):
            with self.subTest(written=written):
                self.assertIsNone(normalize_phone(written))


class AdminCustomerPhoneTests(TestCase):
    """The admin form: normalise on the way in, refuse a number already taken."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(username='boss', password='BossPass1!')
        self.admin.is_staff = True
        self.admin.save()
        self.admin.profile.user_type = 'admin'
        self.admin.profile.save()
        self.client.force_authenticate(self.admin)
        self.url = '/api/auth/admin/customers/create/'

    def _create(self, **extra):
        payload = {
            'username': 'walkin1',
            'first_name': 'Ali',
            'phone_number': '0300-1234567',
            'house_number': '12',
            'area': 'Block 6',
        }
        payload.update(extra)
        return self.client.post(self.url, payload, format='json')

    def test_admin_entered_number_is_stored_canonical(self):
        res = self._create()
        self.assertEqual(res.status_code, http.HTTP_201_CREATED, res.data)
        profile = User.objects.get(username='walkin1').profile
        self.assertEqual(profile.phone_number, '03001234567')

    def test_second_customer_on_the_same_number_is_refused(self):
        self._create()
        res = self._create(username='walkin2', phone_number='+92 300 1234567')
        self.assertEqual(res.status_code, http.HTTP_400_BAD_REQUEST)
        self.assertIn('phone_number', res.data)

    def test_refusal_names_the_existing_customer(self):
        """So the admin UI can offer to open that record instead."""
        self._create()
        res = self._create(username='walkin2', phone_number='03001234567')
        self.assertIn('existing_customer', res.data)
        self.assertEqual(
            res.data['existing_customer']['id'],
            User.objects.get(username='walkin1').id,
        )

    def test_invalid_number_is_rejected_not_stored(self):
        res = self._create(phone_number='12345')
        self.assertEqual(res.status_code, http.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(username='walkin1').exists())


class SignupClaimsNothingTwiceTests(TestCase):
    """Signup must not open a second account for a customer who already exists."""

    def setUp(self):
        self.client = APIClient()
        self.existing = User.objects.create_user(
            username='walkin', password='Walkin1Pass!', first_name='Ali',
        )
        self.existing.profile.user_type = 'customer'
        self.existing.profile.phone_number = '03001234567'
        self.existing.profile.save()
        self.url = '/api/auth/register/'

    def _signup(self, phone):
        return self.client.post(self.url, {
            'username': 'ali_app', 'email': 'ali@example.com',
            'password': 'AppPass123!', 'password_confirm': 'AppPass123!',
            'phone_number': phone, 'house_number': '12', 'area': 'Block 6',
        }, format='json')

    def test_signup_on_an_existing_number_is_refused(self):
        res = self._signup('03001234567')
        self.assertEqual(res.status_code, http.HTTP_400_BAD_REQUEST)
        self.assertIn('phone_number', res.data)
        self.assertFalse(User.objects.filter(username='ali_app').exists())

    def test_a_different_spelling_is_still_the_same_person(self):
        """The whole point: '+92 300 1234567' must not slip past the check."""
        res = self._signup('+92 300 1234567')
        self.assertEqual(res.status_code, http.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(username='ali_app').exists())

    def test_a_genuinely_new_number_still_signs_up(self):
        res = self._signup('0321-7654321')
        self.assertEqual(res.status_code, http.HTTP_201_CREATED, res.data)
        self.assertEqual(
            User.objects.get(username='ali_app').profile.phone_number,
            '03217654321',
        )


class PhoneLookupScopeTests(TestCase):
    """Staff and riders carry numbers too; only customers collide."""

    def test_a_rider_on_the_same_number_is_not_a_duplicate(self):
        rider = User.objects.create_user(username='rider9', password='RiderPass1!')
        rider.profile.user_type = 'delivery_boy'
        rider.profile.phone_number = '03001234567'
        rider.profile.save()
        self.assertIsNone(customer_with_phone('03001234567'))

    def test_editing_a_customer_does_not_collide_with_itself(self):
        cust = User.objects.create_user(username='c1', password='CustPass1!')
        cust.profile.user_type = 'customer'
        cust.profile.phone_number = '03001234567'
        cust.profile.save()
        self.assertIsNone(
            customer_with_phone('03001234567', exclude_user_id=cust.pk)
        )
