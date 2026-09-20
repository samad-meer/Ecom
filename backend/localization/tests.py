"""
Urdu has two switches, and they answer different questions.

`urdu_enabled` is the master — off means English-only for everyone, whatever
the per-user-type list says. That matters while translations are still being
filled in: the office needs to withdraw a half-finished Urdu without losing the
record of who was allowed to use it.
"""

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status as http
from rest_framework.test import APIClient

from .models import LanguageAccessSetting


class LanguageAccessApiTests(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(username='boss', password='BossPass1!')
        self.admin.is_staff = True
        self.admin.save()
        self.customer = User.objects.create_user(username='cust', password='CustPass1!')
        self.url = '/api/localization/language-access/'

    def test_urdu_is_on_by_default(self):
        self.client.force_authenticate(self.customer)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, http.HTTP_200_OK)
        self.assertTrue(res.data['urdu_enabled'])

    def test_admin_can_turn_urdu_off(self):
        self.client.force_authenticate(self.admin)
        res = self.client.patch(self.url, {'urdu_enabled': False}, format='json')
        self.assertEqual(res.status_code, http.HTTP_200_OK)
        self.assertFalse(res.data['urdu_enabled'])
        self.assertFalse(LanguageAccessSetting.load().urdu_enabled)

    def test_turning_urdu_off_keeps_the_access_list(self):
        """So switching it back on restores what was there, rather than making
        the office rebuild the list from memory."""
        self.client.force_authenticate(self.admin)
        self.client.patch(
            self.url, {'allowed_user_types': ['customer', 'delivery_boy']}, format='json',
        )
        self.client.patch(self.url, {'urdu_enabled': False}, format='json')
        setting = LanguageAccessSetting.load()
        self.assertFalse(setting.urdu_enabled)
        self.assertEqual(setting.allowed_user_types, ['customer', 'delivery_boy'])

    def test_a_customer_cannot_change_it(self):
        self.client.force_authenticate(self.customer)
        res = self.client.patch(self.url, {'urdu_enabled': False}, format='json')
        self.assertIn(res.status_code, (http.HTTP_401_UNAUTHORIZED, http.HTTP_403_FORBIDDEN))
        self.assertTrue(LanguageAccessSetting.load().urdu_enabled)
