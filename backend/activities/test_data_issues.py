"""
Bad data leaves a trace an admin can find.

A rejected phone number used to vanish into a 400 that only the person typing
ever saw. These rows are the difference between "the office knows a returning
customer could not get in" and "the customer gave up and nobody found out".
"""

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from .models import ActivityLog


class DataIssueLoggingTests(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(username='boss', password='BossPass1!')
        self.admin.is_staff = True
        self.admin.save()
        self.admin.profile.user_type = 'admin'
        self.admin.profile.save()
        self.create_url = '/api/auth/admin/customers/create/'

    def _create(self, **extra):
        self.client.force_authenticate(self.admin)
        payload = {
            'username': 'walkin1', 'first_name': 'Ali',
            'phone_number': '0300-1234567',
            'house_number': '12', 'area': 'Block 6',
        }
        payload.update(extra)
        return self.client.post(self.create_url, payload, format='json')

    # ── Phone ────────────────────────────────────────────────────────────────

    def test_invalid_phone_is_logged(self):
        self._create(phone_number='12345')
        row = ActivityLog.objects.get(action='Invalid Phone Rejected')
        self.assertEqual(row.category, ActivityLog.CATEGORY_DATA)
        self.assertEqual(row.details['entered'], '12345')
        self.assertEqual(row.actor_id, self.admin.id)

    def test_duplicate_phone_is_logged_against_the_existing_customer(self):
        self._create()
        existing = User.objects.get(username='walkin1')
        self._create(username='walkin2', phone_number='+92 300 1234567')
        row = ActivityLog.objects.get(action='Duplicate Phone Blocked')
        self.assertEqual(row.category, ActivityLog.CATEGORY_DATA)
        # Points at the customer who already holds the number, so the admin
        # lands on the record that matters rather than the failed attempt.
        self.assertEqual(row.target_id, existing.id)
        self.assertEqual(row.details['tried_to_create'], 'walkin2')

    # ── Address ──────────────────────────────────────────────────────────────

    def test_missing_address_parts_are_logged_but_the_customer_still_saves(self):
        res = self._create(house_number='', area='')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(User.objects.filter(username='walkin1').exists())
        row = ActivityLog.objects.get(action='Incomplete Customer Record')
        self.assertIn('house number', row.details['missing'])
        self.assertIn('area', row.details['missing'])

    def test_a_complete_record_logs_no_issue(self):
        self._create()
        self.assertFalse(
            ActivityLog.objects.filter(category=ActivityLog.CATEGORY_DATA).exists()
        )

    def test_missing_phone_counts_as_a_gap(self):
        self._create(phone_number='')
        row = ActivityLog.objects.get(action='Incomplete Customer Record')
        self.assertIn('phone', row.details['missing'])

    # ── Signup ───────────────────────────────────────────────────────────────

    def test_returning_customer_signup_is_logged(self):
        """The row the whole feature exists for: someone the office already has
        on file trying to get into the app."""
        self._create()
        existing = User.objects.get(username='walkin1')
        self.client.force_authenticate(None)
        self.client.post('/api/auth/register/', {
            'username': 'ali_app', 'email': 'ali@example.com',
            'password': 'AppPass123!', 'password_confirm': 'AppPass123!',
            'phone_number': '03001234567', 'house_number': '12', 'area': 'Block 6',
        }, format='json')

        row = ActivityLog.objects.get(action='Existing Customer Tried To Sign Up')
        self.assertEqual(row.target_id, existing.id)
        self.assertEqual(row.details['chose_username'], 'ali_app')
        self.assertIsNone(row.actor_id)  # nobody is signed in yet

    def test_a_signup_typo_is_not_logged(self):
        """A public form collects typos all day; logging them would bury the
        rows that need acting on."""
        self.client.force_authenticate(None)
        self.client.post('/api/auth/register/', {
            'username': 'new_guy', 'email': 'new@example.com',
            'password': 'AppPass123!', 'password_confirm': 'AppPass123!',
            'phone_number': '123', 'house_number': '12', 'area': 'Block 6',
        }, format='json')
        self.assertFalse(
            ActivityLog.objects.filter(category=ActivityLog.CATEGORY_DATA).exists()
        )


class ActivityCountsTests(TestCase):
    """Tab badges: counted before the category filter, so they stay meaningful
    once a tab is selected."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(username='boss2', password='BossPass1!')
        self.admin.is_staff = True
        self.admin.save()
        self.client.force_authenticate(self.admin)
        for category, action in (
            ('order', 'Order Created'),
            ('order', 'Order Cancelled'),
            ('rider', 'Delivery Completed'),
            ('data', 'Duplicate Phone Blocked'),
        ):
            ActivityLog.objects.create(
                category=category, action=action, actor=self.admin,
                actor_name='boss2',
            )

    def test_counts_cover_every_category(self):
        res = self.client.get('/api/activities/')
        self.assertEqual(res.data['counts']['order'], 2)
        self.assertEqual(res.data['counts']['rider'], 1)
        self.assertEqual(res.data['counts']['data'], 1)
        self.assertEqual(res.data['total_all'], 4)

    def test_selecting_a_tab_does_not_collapse_the_other_badges(self):
        res = self.client.get('/api/activities/?category=data')
        self.assertEqual(res.data['count'], 1)          # rows in this tab
        self.assertEqual(res.data['counts']['order'], 2)  # badge still right
        self.assertEqual(res.data['total_all'], 4)

    def test_other_filters_still_narrow_the_badges(self):
        res = self.client.get('/api/activities/?action=Order Created')
        self.assertEqual(res.data['counts'].get('order'), 1)
        self.assertNotIn('rider', res.data['counts'])
