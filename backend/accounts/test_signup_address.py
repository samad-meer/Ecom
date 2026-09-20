"""
The address a customer types at signup must reach their address book.

It used to live only on the profile, and checkout reads the address book — so a
customer who had just given their full address was told "You have no saved
addresses yet" and had to type it all again before they could order. That is a
drop-off point created entirely by our own data plumbing.
"""

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from rest_framework import status as http
from rest_framework.test import APIClient

from .models import CustomerAddress


class SignupSeedsAddressBookTests(TestCase):

    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def _signup(self, **extra):
        payload = {
            'username': 'newcust', 'email': 'new@example.com',
            'password': 'AppPass123!', 'password_confirm': 'AppPass123!',
            'phone_number': '0300-9998877',
            'house_number': '112', 'block': 'E', 'area': 'Jubilee Town',
        }
        payload.update(extra)
        return self.client.post('/api/auth/register/', payload, format='json')

    def test_signup_creates_a_default_address(self):
        res = self._signup()
        self.assertEqual(res.status_code, http.HTTP_201_CREATED, res.data)
        user = User.objects.get(username='newcust')
        address = CustomerAddress.objects.get(user=user)
        self.assertTrue(address.is_default)
        self.assertEqual(address.house_number, '112')
        self.assertEqual(address.block, 'E')
        self.assertEqual(address.area, 'Jubilee Town')

    def test_the_new_customer_can_reach_checkout_without_retyping(self):
        """The whole point: their address book is not empty on arrival."""
        self._signup()
        self.client.force_authenticate(User.objects.get(username='newcust'))
        res = self.client.get('/api/auth/addresses/')
        rows = res.data if isinstance(res.data, list) else res.data.get('results', [])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['area'], 'Jubilee Town')

    def test_a_pin_dropped_at_signup_is_carried_over(self):
        self._signup(customer_latitude='31.409558', customer_longitude='74.192625')
        address = CustomerAddress.objects.get(user__username='newcust')
        self.assertIsNotNone(address.latitude)
        self.assertIsNotNone(address.longitude)
        self.assertEqual(str(address.latitude), '31.409558')


class SignupDuplicateMessagesTests(TestCase):
    """What a customer reads when the account already exists.

    DRF's stock "This field must be unique." names neither the field nor the
    remedy, and it was what someone saw under their own email address.
    """

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        existing = User.objects.create_user(
            username='faheem', email='crcfaheem@gmail.com', password='OldPass123!',
        )
        existing.profile.user_type = 'customer'
        existing.profile.save()

    def _signup(self, **extra):
        payload = {
            'username': 'someoneelse', 'email': 'fresh@example.com',
            'password': 'AppPass123!', 'password_confirm': 'AppPass123!',
            'phone_number': '0300-1112233',
            'house_number': '12', 'area': 'Jubilee Town',
        }
        payload.update(extra)
        return self.client.post('/api/auth/register/', payload, format='json')

    def test_duplicate_email_says_so_and_points_at_signing_in(self):
        res = self._signup(email='crcfaheem@gmail.com')
        self.assertEqual(res.status_code, http.HTTP_400_BAD_REQUEST)
        message = str(res.data['email'][0])
        self.assertIn('already has an account', message)
        self.assertNotIn('must be unique', message)

    def test_a_fresh_email_still_registers(self):
        res = self._signup()
        self.assertEqual(res.status_code, http.HTTP_201_CREATED, res.data)
