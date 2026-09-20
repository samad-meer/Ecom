import re
from datetime import datetime, time, timedelta
from decimal import Decimal

from rest_framework import generics, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated, BasePermission
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth.models import User
from django.db import transaction
from django.db.models.deletion import ProtectedError
from django.shortcuts import get_object_or_404
from django.db.models import Count, Q, Sum, Value
from django.db.models.functions import Coalesce, Replace
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from core.timeframes import scope_to_days
from core.address import normalize_portion
from activities.service import log_data_issue
from .phone import duplicate_phone_error, normalize_phone
from .serializers import (
    AreaSerializer, DiscountCategorySerializer, RegisterSerializer, UserSerializer,
    UpdateProfileSerializer, ChangePasswordSerializer,
    StaffProfileSerializer, CreateStaffSerializer, UpdateStaffSerializer,
    NotificationTemplateSerializer,
    CustomerLocationInputSerializer,
    RiderLocationEchoSerializer, RiderLocationPingInputSerializer,
    RiderLocationPingSerializer, RiderLocationSerializer,
    TrackingSettingsSerializer,
    CustomerAddressSerializer,
    password_policy_error,
)
from .models import (
    Area, CustomerAddress,
    DiscountCategory, UserProfile, MobileProfileConfig, PROFILE_FIELD_DEFAULTS,
    NotificationTemplate, RiderLocation, RiderLocationPing, TrackingSettings,
    CUSTOMER_PIN_FIELDS,
)
from activities.service import log as activity_log


class IsStaff(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


class AreaListView(generics.ListAPIView):
    """
    Public: the areas offered on the signup form.

    Unauthenticated because signup happens before there is a user, and the
    list is not sensitive — it is the localities the business delivers to.
    Only active areas are returned.
    """
    permission_classes = (AllowAny,)
    serializer_class = AreaSerializer
    pagination_class = None

    def get_queryset(self):
        return Area.objects.filter(is_active=True)


class AdminAreaListCreateView(generics.ListCreateAPIView):
    """Staff-managed area list — includes inactive ones."""
    permission_classes = (IsStaff,)
    serializer_class = AreaSerializer
    queryset = Area.objects.all()
    pagination_class = None


class AdminAreaDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = (IsStaff,)
    serializer_class = AreaSerializer
    queryset = Area.objects.all()


# ─── Customer discount categories (staff-only, no public counterpart) ─────────

class AdminDiscountCategoryListCreateView(generics.ListCreateAPIView):
    """Staff-managed discount tiers. Deliberately has NO customer-facing list."""
    permission_classes = (IsStaff,)
    serializer_class = DiscountCategorySerializer
    queryset = DiscountCategory.objects.all()
    pagination_class = None


class AdminDiscountCategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = (IsStaff,)
    serializer_class = DiscountCategorySerializer
    queryset = DiscountCategory.objects.all()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            instance.delete()
        except ProtectedError:
            # PROTECT on UserProfile.discount_category: deleting must fail
            # loudly, never silently strip customers of their discount.
            count = instance.customers.count()
            return Response(
                {'detail': f'Cannot delete "{instance.name}": {count} customer(s) '
                           'are still assigned to it. Reassign them first, or '
                           'deactivate the category instead.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class DiscountReportView(APIView):
    """
    Per-category discount totals for a date range — the "revenue forgone"
    report. Staff only. ?start=YYYY-MM-DD&end=YYYY-MM-DD plus limit/offset;
    orders count by their creation date, plant records by their record date.
    """
    permission_classes = [IsStaff]

    DEFAULT_LIMIT = 100
    MAX_LIMIT = 500

    @staticmethod
    def _parse_date(raw):
        if not raw:
            return None
        try:
            return datetime.strptime(raw, '%Y-%m-%d').date()
        except ValueError:
            return None

    def get(self, request):
        from orders.models import Order
        from plant.models import DeliveryRecord

        p = request.query_params
        start = self._parse_date(p.get('start'))
        end = self._parse_date(p.get('end'))

        # Only rows that actually gave a discount count as "discounted".
        # Cancelled orders are excluded — their charge was reversed, so the
        # discount was never really given.
        orders = Order.objects.filter(
            discount_category__isnull=False, discount_amount__gt=0,
        ).exclude(status='Cancelled')
        records = DeliveryRecord.objects.filter(
            discount_category__isnull=False, discount_amount__gt=0,
        )
        # DeliveryRecord.date is a plain DateField, so it compares directly;
        # Order.created_at is an aware datetime and needs the day bounds.
        orders = scope_to_days(orders, 'created_at', start, end)
        if start:
            records = records.filter(date__gte=start)
        if end:
            records = records.filter(date__lte=end)

        def _by_category(qs, net_field):
            return {
                row['discount_category_id']: row
                for row in qs.values('discount_category_id').annotate(
                    n=Count('id'),
                    gross=Sum('gross_amount'),
                    discount=Sum('discount_amount'),
                    net=Sum(net_field),
                )
            }

        order_rows = _by_category(orders, 'total_price')
        record_rows = _by_category(records, 'amount')
        assigned = {
            row['discount_category_id']: row['n']
            for row in UserProfile.objects.filter(discount_category__isnull=False)
            .values('discount_category_id').annotate(n=Count('id'))
        }

        zero = Decimal('0')
        results = []
        for category in DiscountCategory.objects.all():
            o = order_rows.get(category.pk)
            r = record_rows.get(category.pk)
            gross = (o['gross'] if o else zero) + (r['gross'] if r else zero)
            discount = (o['discount'] if o else zero) + (r['discount'] if r else zero)
            net = (o['net'] if o else zero) + (r['net'] if r else zero)
            results.append({
                'id': category.pk,
                'name': category.name,
                'discount_type': category.discount_type,
                'discount_value': str(category.discount_value),
                'is_active': category.is_active,
                'customers_assigned': assigned.get(category.pk, 0),
                'orders_discounted': o['n'] if o else 0,
                'records_discounted': r['n'] if r else 0,
                'gross': str(gross),
                'discount_given': str(discount),
                'net': str(net),
            })

        try:
            limit = min(int(p.get('limit', self.DEFAULT_LIMIT)), self.MAX_LIMIT)
            offset = max(int(p.get('offset', 0)), 0)
        except (TypeError, ValueError):
            limit, offset = self.DEFAULT_LIMIT, 0

        return Response({
            'count': len(results),
            'limit': limit,
            'offset': offset,
            'results': results[offset:offset + limit],
        })


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (AllowAny,)
    serializer_class = RegisterSerializer


class UserProfileView(generics.RetrieveUpdateAPIView):
    permission_classes = (IsAuthenticated,)

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return UpdateProfileSerializer
        return UserSerializer

    def get_object(self):
        return self.request.user

    def update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        super().update(request, *args, **kwargs)
        return Response(UserSerializer(request.user, context={'request': request}).data)


class ChangePasswordView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data, context={'request': request}
        )
        if request.user.is_staff:
            return Response(
                {'detail': 'Staff passwords can only be changed by an administrator.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save()
        activity_log(
            request.user, 'user', 'Password Changed',
            target_type='user', target_id=request.user.id,
            target_label=request.user.username,
        )
        return Response({'detail': 'Password updated successfully.'})


# ─── Staff management (replaces rider-only management) ───────────────────────

class AdminStaffListCreateView(generics.ListCreateAPIView):
    """List all staff (riders + non-rider staff). Admins only."""
    permission_classes = [IsStaff]

    def get_queryset(self):
        return (
            UserProfile.objects
            .filter(user_type__in=['staff', 'delivery_boy'])
            .select_related('user')
            .prefetch_related('assigned_orders')
            .order_by('user__first_name', 'user__username')
        )

    def get_serializer_class(self):
        return CreateStaffSerializer if self.request.method == 'POST' else StaffProfileSerializer

    def create(self, request, *args, **kwargs):
        serializer = CreateStaffSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = serializer.save()
        profile.created_by = request.user
        profile.save(update_fields=['created_by'])
        activity_log(
            request.user, 'user', 'Staff Created',
            target_type='staff', target_id=profile.id,
            target_label=profile.user.get_full_name() or profile.user.username,
            details={'username': profile.user.username, 'is_rider': profile.is_rider},
        )
        return Response(
            StaffProfileSerializer(profile, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class AdminStaffDetailView(generics.RetrieveUpdateAPIView):
    """Retrieve or update a single staff member. Inactive staff can still be edited."""
    permission_classes = [IsStaff]

    def get_queryset(self):
        # Allow editing regardless of working_status
        return (
            UserProfile.objects
            .filter(user_type__in=['staff', 'delivery_boy'])
            .select_related('user')
            .prefetch_related('assigned_orders')
        )

    def get_serializer_class(self):
        return UpdateStaffSerializer if self.request.method in ('PUT', 'PATCH') else StaffProfileSerializer

    def update(self, request, *args, **kwargs):
        profile = self.get_object()
        serializer = UpdateStaffSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        return Response(StaffProfileSerializer(updated, context={'request': request}).data)


class AdminStaffDocumentView(APIView):
    """Upload documents (profile picture, CNIC, driving licence) for a staff member."""
    permission_classes = [IsStaff]

    ALLOWED_FIELDS = {'profile_picture', 'cnic_front', 'cnic_back', 'driving_license'}

    def patch(self, request, pk):
        profile = get_object_or_404(
            UserProfile, pk=pk, user_type__in=['staff', 'delivery_boy']
        )
        updated = False
        for field in self.ALLOWED_FIELDS:
            if field in request.FILES:
                setattr(profile, field, request.FILES[field])
                updated = True
        if updated:
            profile.save()
        return Response(StaffProfileSerializer(profile, context={'request': request}).data)


class AdminStaffHistoryView(APIView):
    """Delivery history for a staff member who is a rider."""
    permission_classes = [IsStaff]

    def get(self, request, pk):
        from orders.serializers import AdminOrderSerializer
        profile = get_object_or_404(
            UserProfile, pk=pk, user_type__in=['staff', 'delivery_boy']
        )
        if not profile.is_rider:
            return Response(
                {'detail': 'This staff member is not a rider.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        orders = (
            profile.assigned_orders
            .select_related('user')
            .prefetch_related('items__product')
            .order_by('-created_at')
        )
        return Response(AdminOrderSerializer(orders, many=True, context={'request': request}).data)


def _customer_address_payload(profile):
    """The structured address parts alongside the composed line.

    Both are sent: `address` is what search, PDFs and the rider app read, while
    the parts are what an edit form has to put back into its inputs. Deriving
    the parts client-side by splitting the line only works for records saved
    since the split existed.
    """
    return {
        'house_number': profile.house_number,
        'portion': profile.portion,
        'block': profile.block,
        'area': profile.area,
    }


def _customer_pin_payload(profile):
    """The delivery pin as staff and rider payloads carry it — coordinates as
    JSON numbers (Google Maps LatLngLiteral), plus whose claim the pin is."""
    return {
        'customer_latitude': (
            float(profile.customer_latitude)
            if profile.customer_latitude is not None else None
        ),
        'customer_longitude': (
            float(profile.customer_longitude)
            if profile.customer_longitude is not None else None
        ),
        'location_source': profile.location_source,
        'location_set_at': (
            profile.location_set_at.isoformat()
            if profile.location_set_at else None
        ),
    }


def _customer_search_q(term):
    """Everything one search word may match on a customer record."""
    q = (
        Q(user__username__icontains=term) |
        Q(user__first_name__icontains=term) |
        Q(user__last_name__icontains=term) |
        Q(user__email__icontains=term) |
        Q(phone_number__icontains=term) |
        Q(address__icontains=term) |
        # The structured parts as well as the composed line: an address saved
        # before the split existed only has `address`, and one saved after may
        # have parts the composed line abbreviates.
        Q(house_number__icontains=term) |
        Q(block__icontains=term) |
        Q(area__icontains=term)
    )
    # Phone numbers get written 0300-1234567, 0300 1234567, +923001234567.
    # Comparing digits-only means any of those spellings finds the record.
    digits = re.sub(r'\D', '', term)
    if len(digits) >= 3:
        q |= Q(phone_digits__contains=digits)
    return q


class AdminCustomerListView(APIView):
    """List all registered customers (user_type=customer) with optional search."""
    permission_classes = [IsStaff]

    def get(self, request):
        q = (request.query_params.get('search') or '').strip()
        qs = (
            UserProfile.objects
            .filter(user_type='customer')
            .select_related('user', 'discount_category')
            .order_by('user__first_name', 'user__username')
        )
        if q:
            # Strip the punctuation people type into phone numbers so it can be
            # matched digit-for-digit, whatever separators the record uses.
            qs = qs.annotate(
                phone_digits=Replace(
                    Replace(
                        Replace(
                            Replace(Coalesce('phone_number', Value('')),
                                    Value('-'), Value('')),
                            Value(' '), Value('')),
                        Value('('), Value('')),
                    Value(')'), Value(''),
                ),
            )
            # Every word must match something, but not necessarily the same
            # thing — "ali johar" finds Ali in Johar Town, which a single
            # icontains over the whole phrase never would.
            for term in q.split():
                qs = qs.filter(_customer_search_q(term))
            qs = qs.distinct()
        data = []
        for profile in qs:
            u = profile.user
            data.append({
                'id': u.id,
                'username': u.username,
                'name': u.get_full_name() or u.username,
                'first_name': u.first_name,
                'last_name': u.last_name,
                'email': u.email,
                'phone': profile.phone_number,
                'address': profile.address,
                **_customer_address_payload(profile),
                'date_joined': u.date_joined.isoformat(),
                'is_active': u.is_active,
                'discount_category': profile.discount_category_id,
                'discount_category_name': (
                    profile.discount_category.name
                    if profile.discount_category_id else None
                ),
                **_customer_pin_payload(profile),
            })
        return Response(data)


class AdminCustomerDetailView(APIView):
    """Admin reads / updates a single customer's profile info."""
    permission_classes = [IsStaff]

    def _serialize(self, user):
        profile = user.profile
        return {
            'id': user.id,
            'username': user.username,
            'name': user.get_full_name() or user.username,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'email': user.email,
            'phone': profile.phone_number,
            'address': profile.address,
            **_customer_address_payload(profile),
            'date_joined': user.date_joined.isoformat(),
            'is_active': user.is_active,
            'discount_category': profile.discount_category_id,
            'discount_category_name': (
                profile.discount_category.name
                if profile.discount_category_id else None
            ),
            **_customer_pin_payload(profile),
        }

    def get(self, request, user_id):
        user = get_object_or_404(User, pk=user_id)
        return Response(self._serialize(user))

    def patch(self, request, user_id):
        user = get_object_or_404(User, pk=user_id)
        data = request.data
        changed_user = False
        for field in ('first_name', 'last_name'):
            if field in data:
                setattr(user, field, (data[field] or '').strip())
                changed_user = True
        if 'is_active' in data:
            user.is_active = bool(data['is_active'])
            changed_user = True
        if changed_user:
            user.save()
        profile = user.profile
        changed_profile = []
        if 'phone_number' in data:
            raw = (data['phone_number'] or '').strip()
            if raw:
                # Same canonical form and same one-number-one-customer rule as
                # creation, or an edit becomes the way around both.
                normalized = normalize_phone(raw)
                if normalized is None:
                    log_data_issue(
                        request.user, 'Invalid Phone Rejected',
                        target_type='customer', target_id=user.pk,
                        target_label=user.get_full_name() or user.username,
                        details={'entered': raw, 'where': 'admin edit'},
                    )
                    return Response(
                        {'phone_number': 'Enter a valid mobile number, e.g. 0300-1234567.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                duplicate = duplicate_phone_error(normalized, exclude_user_id=user.pk)
                if duplicate:
                    log_data_issue(
                        request.user, 'Duplicate Phone Blocked',
                        target_type='customer',
                        target_id=duplicate['existing_customer']['id'],
                        target_label=duplicate['existing_customer']['name'],
                        details={
                            'phone': normalized,
                            'tried_on': user.get_full_name() or user.username,
                            'where': 'admin edit',
                        },
                    )
                    return Response(duplicate, status=status.HTTP_400_BAD_REQUEST)
                profile.phone_number = normalized
            else:
                profile.phone_number = None
            changed_profile.append('phone_number')
        if 'address' in data:
            profile.address = (data['address'] or '').strip() or None
            changed_profile.append('address')
        # Structured address parts. Portion is normalised because the picker
        # sends a key ('first_floor') but older records and imports carry the
        # label ('1st Floor'), and only one of those groups or reports.
        for field in ('house_number', 'block', 'area'):
            if field in data:
                setattr(profile, field, (data[field] or '').strip() or None)
                changed_profile.append(field)
        if 'portion' in data:
            profile.portion = normalize_portion(data['portion']) or None
            changed_profile.append('portion')
        # Rebuild the composed line the rest of the system reads, unless the
        # caller sent one explicitly — same rule as the customer's own profile
        # update, so an admin edit and a self-edit cannot disagree.
        if 'address' not in data and any(
            f in data for f in ('house_number', 'portion', 'block', 'area')
        ):
            profile.sync_address()
            changed_profile.append('address')
        old_category = profile.discount_category
        if 'discount_category' in data:
            raw = data['discount_category']
            if raw in (None, ''):
                profile.discount_category = None
            else:
                try:
                    profile.discount_category = DiscountCategory.objects.get(pk=raw)
                except (DiscountCategory.DoesNotExist, TypeError, ValueError):
                    return Response(
                        {'discount_category': 'Unknown discount category.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            changed_profile.append('discount_category')
        if changed_profile:
            profile.save(update_fields=changed_profile)
        activity_log(
            request.user, 'customer', 'Customer Updated',
            target_type='customer', target_id=user.id,
            target_label=user.get_full_name() or user.username,
        )
        new_category = profile.discount_category
        if 'discount_category' in data and new_category != old_category:
            # Assignment changes future billing, so it gets its own audit row.
            activity_log(
                request.user, 'customer', 'Discount Category Assigned',
                target_type='customer', target_id=user.id,
                target_label=user.get_full_name() or user.username,
                details={
                    'from': old_category.name if old_category else None,
                    'to': new_category.name if new_category else None,
                },
            )
        return Response(self._serialize(user))


class CustomerLocationView(APIView):
    """
    POST /api/auth/customers/<user_id>/location/ — drop or correct a
    customer's delivery pin from the field.

    Staff may pin any customer. A rider may only pin a customer they are
    CURRENTLY carrying an undelivered order for — the moment of standing at
    the right gate is exactly when the pin is worth correcting. Customers set
    their own pin through registration / profile, never through here.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id):
        target = get_object_or_404(User, pk=user_id, profile__user_type='customer')

        requester_type = getattr(
            getattr(request.user, 'profile', None), 'user_type', None,
        )
        if request.user.is_staff:
            pass
        elif requester_type == 'delivery_boy':
            from orders.models import Order  # local import keeps accounts import-light

            has_active_order = (
                Order.objects
                .filter(assigned_delivery_boy=request.user.profile, user=target)
                .exclude(status__in=['Delivered', 'Cancelled'])
                .exists()
            )
            if not has_active_order:
                return Response(
                    {'detail': 'You are not currently assigned an active order '
                               'for this customer.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        else:
            return Response(
                {'detail': 'Only staff or the assigned rider may set a '
                           'customer location.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        payload = CustomerLocationInputSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        profile = target.profile
        # 'rider' covers every business-side correction (rider at the gate or
        # staff at the desk); set_by records exactly who.
        profile.set_customer_pin(
            payload.validated_data['customer_latitude'],
            payload.validated_data['customer_longitude'],
            source='rider', set_by=request.user,
        )
        profile.save(update_fields=CUSTOMER_PIN_FIELDS)

        activity_log(
            request.user, 'customer', 'Customer Location Set',
            target_type='customer', target_id=target.id,
            target_label=target.get_full_name() or target.username,
            details={
                'latitude': str(profile.customer_latitude),
                'longitude': str(profile.customer_longitude),
            },
        )
        return Response(_customer_pin_payload(profile))


class CustomerAddressViewSet(viewsets.ModelViewSet):
    """The signed-in customer's address book.

    Scoped to `request.user` at the queryset level, so an id belonging to
    somebody else is a 404 rather than a leak. The first address a customer
    saves becomes their default automatically (see the model), which is what
    lets checkout pre-select without asking.
    """
    serializer_class = CustomerAddressSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return CustomerAddress.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'])
    def set_default(self, request, pk=None):
        """Promote this address. The model demotes whichever held it."""
        address = self.get_object()
        address.is_default = True
        address.save()
        return Response(self.get_serializer(address).data)


def _log_address_gaps(actor, user, profile, *, where, missing_phone=False):
    """
    Note what is missing from a customer record that a rider will need.

    Not a validation error on purpose. Walk-in and phone customers are often
    entered from half a conversation, and refusing the save would only teach
    the operator to type '-' into the box. Logging leaves the record usable and
    the gap findable.
    """
    missing = []
    if not (profile.house_number or '').strip():
        missing.append('house number')
    if not (profile.area or '').strip():
        missing.append('area')
    if missing_phone:
        missing.append('phone')
    if not missing:
        return
    log_data_issue(
        actor, 'Incomplete Customer Record',
        target_type='customer', target_id=user.id,
        target_label=user.get_full_name() or user.username,
        details={'missing': ', '.join(missing), 'where': where},
    )


class AdminCustomerCreateView(APIView):
    """Admin creates a customer account in one request.

    Address is collected in the same parts as signup (house / portion / block /
    area) and composed into `address`. A bare `address` string is still accepted
    so older clients keep working, but the parts win when both are sent.

    Password is optional: these are internal records for walk-in and phone
    customers who never sign in. Leaving it blank stores an unusable password,
    so the account cannot be logged into until an admin sets one. When a
    password IS supplied it must clear the same policy as customer signup.
    """
    permission_classes = [IsStaff]

    def post(self, request):
        username = (request.data.get('username') or '').strip()
        password = request.data.get('password') or ''
        first_name = (request.data.get('first_name') or '').strip()
        last_name = (request.data.get('last_name') or '').strip()
        email = (request.data.get('email') or '').strip()
        phone = (request.data.get('phone_number') or '').strip()

        house_number = (request.data.get('house_number') or '').strip()
        # Any spelling in, canonical key out — see core.address.
        portion = normalize_portion(request.data.get('portion'))
        block = (request.data.get('block') or '').strip()
        area = (request.data.get('area') or '').strip()
        address = (request.data.get('address') or '').strip()

        if not username:
            return Response({'username': 'Username is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(username__iexact=username).exists():
            return Response({'username': 'Username already taken.'}, status=status.HTTP_400_BAD_REQUEST)

        # The number is stored canonical so that '0300-1234567' typed here and
        # '03001234567' from the signup form are one customer, not two. Without
        # this the duplicate check below cannot see across the two entry points.
        if phone:
            normalized = normalize_phone(phone)
            if normalized is None:
                log_data_issue(
                    request.user, 'Invalid Phone Rejected',
                    target_type='customer', target_label=username,
                    details={'entered': phone, 'where': 'admin create'},
                )
                return Response(
                    {'phone_number': 'Enter a valid mobile number, e.g. 0300-1234567.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            phone = normalized
            # Carries the existing customer's id so the UI can offer to open
            # that record rather than making the operator go and find it.
            duplicate = duplicate_phone_error(phone)
            if duplicate:
                log_data_issue(
                    request.user, 'Duplicate Phone Blocked',
                    target_type='customer',
                    target_id=duplicate['existing_customer']['id'],
                    target_label=duplicate['existing_customer']['name'],
                    details={
                        'phone': phone,
                        'tried_to_create': username,
                        'where': 'admin create',
                    },
                )
                return Response(duplicate, status=status.HTTP_400_BAD_REQUEST)

        if password:
            policy_error = password_policy_error(password)
            if policy_error:
                return Response({'password': policy_error}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.create(
            username=username,
            email=email,
            first_name=first_name,
            last_name=last_name,
            is_active=True,
        )
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()

        profile = user.profile
        profile.user_type = 'customer'
        if phone:
            profile.phone_number = phone
        profile.house_number = house_number
        profile.portion = portion
        profile.block = block
        profile.area = area
        # sync_address() only overwrites when at least one part is filled, so a
        # client that still sends a single free-text address keeps it.
        if address:
            profile.address = address
        profile.sync_address()
        profile.save(update_fields=[
            'user_type', 'phone_number', 'house_number', 'portion',
            'block', 'area', 'address',
        ])

        activity_log(
            request.user, 'customer', 'Customer Created',
            target_type='customer', target_id=user.id,
            target_label=user.get_full_name() or user.username,
            details={'username': user.username, 'can_sign_in': bool(password)},
        )

        # A customer with no house number or no area cannot be navigated to.
        # The record still saves — refusing it would just push the operator to
        # invent something — but the gap is logged so it can be chased.
        _log_address_gaps(
            request.user, user, profile,
            where='admin create', missing_phone=not phone,
        )
        return Response({
            'id': user.id,
            'username': user.username,
            'name': user.get_full_name() or user.username,
            'phone': profile.phone_number,
            'address': profile.address,
            'house_number': profile.house_number,
            'portion': profile.portion,
            'block': profile.block,
            'area': profile.area,
            'can_sign_in': bool(password),
        }, status=status.HTTP_201_CREATED)


class AdminResetPasswordView(APIView):
    """Admin resets any user's password. POST with {new_password} or {generate: true}."""
    permission_classes = [IsStaff]

    def post(self, request, user_id):
        import secrets
        import string
        user = get_object_or_404(User, pk=user_id)

        # Without this, any is_staff account could take over a superuser's login.
        if user.is_superuser and not request.user.is_superuser:
            return Response(
                {'detail': 'Only a superuser can reset a superuser password.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        generate = request.data.get('generate', False)
        new_password = (request.data.get('new_password') or '').strip()

        if generate:
            alphabet = string.ascii_letters + string.digits
            new_password = ''.join(secrets.choice(alphabet) for _ in range(10))
        elif len(new_password) < 6:
            return Response(
                {'new_password': 'Password must be at least 6 characters.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(new_password)
        user.save()
        activity_log(
            request.user, 'user', 'Password Reset by Admin',
            target_type='user', target_id=user.id,
            target_label=user.username,
        )
        return Response({
            'detail': 'Password updated.',
            'new_password': new_password if generate else None,
        })


# ─── Legacy aliases (for backward compat with mobile app or old endpoints) ───

AdminRiderListCreateView = AdminStaffListCreateView
AdminRiderDetailView = AdminStaffDetailView
AdminRiderHistoryView = AdminStaffHistoryView


class UpdatePushTokenView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        token = request.data.get('token')
        if not token:
            return Response({'error': 'Token is required'}, status=status.HTTP_400_BAD_REQUEST)
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        profile.expo_push_token = token
        profile.save()
        return Response({'status': 'Token updated'}, status=status.HTTP_200_OK)


def _is_truthy(value):
    """Google returns email_verified as a real bool or the string "true"."""
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ('true', '1')


class GoogleAuthView(APIView):
    """Sign in or register via Google OAuth. New users are always created as customers."""
    permission_classes = (AllowAny,)

    def post(self, request):
        import requests as google_req
        import re
        from django.conf import settings as dj_settings
        from rest_framework_simplejwt.tokens import RefreshToken

        access_token = (request.data.get('access_token') or '').strip()
        if not access_token:
            return Response({'error': 'access_token is required.'}, status=status.HTTP_400_BAD_REQUEST)

        allowed_client_ids = getattr(dj_settings, 'GOOGLE_ALLOWED_CLIENT_IDS', [])

        # Confirm the token was minted for one of OUR OAuth clients. Without
        # this, a token issued to any other Google app would authenticate here,
        # letting that app's operator sign in as any of its users.
        if allowed_client_ids:
            try:
                info = google_req.get(
                    'https://oauth2.googleapis.com/tokeninfo',
                    params={'access_token': access_token},
                    timeout=10,
                )
            except Exception:
                return Response({'error': 'Could not reach Google servers.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

            if not info.ok:
                return Response({'error': 'Invalid or expired Google token.'}, status=status.HTTP_401_UNAUTHORIZED)

            token_info = info.json()
            # `aud` is the client the token was issued for; `azp` is the
            # authorized party, which differs when e.g. the Android client
            # obtains a token whose audience is the Web client. Either one
            # matching our own clients is enough.
            claimed = {token_info.get('aud'), token_info.get('azp')} - {None, ''}
            if not claimed & set(allowed_client_ids):
                return Response(
                    {'error': 'This Google token was not issued for this application.'},
                    status=status.HTTP_401_UNAUTHORIZED,
                )

        # Verify token & get user info from Google
        try:
            res = google_req.get(
                'https://www.googleapis.com/oauth2/v3/userinfo',
                headers={'Authorization': f'Bearer {access_token}'},
                timeout=10,
            )
        except Exception:
            return Response({'error': 'Could not reach Google servers.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        if not res.ok:
            return Response({'error': 'Invalid or expired Google token.'}, status=status.HTTP_401_UNAUTHORIZED)

        data = res.json()
        email = data.get('email', '').strip().lower()
        if not email:
            return Response({'error': 'Google account has no email address.'}, status=status.HTTP_400_BAD_REQUEST)

        # An unverified address must never match an existing account — otherwise
        # anyone able to set that address on a Google Workspace domain could
        # sign in as the password user who owns it here.
        if not _is_truthy(data.get('email_verified')):
            return Response(
                {'error': 'Your Google email address is not verified.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Find existing user or create a new customer
        try:
            user = User.objects.get(email=email)
            if not user.is_active:
                return Response(
                    {'error': 'This account has been disabled.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except User.MultipleObjectsReturned:
            # Email is not unique at the DB level; refuse rather than guess
            # which account the caller meant.
            return Response(
                {'error': 'Multiple accounts share this email. Please contact support.'},
                status=status.HTTP_409_CONFLICT,
            )
        except User.DoesNotExist:
            base = re.sub(r'[^a-zA-Z0-9_]', '', email.split('@')[0])[:20] or 'user'
            username, counter = base, 1
            while User.objects.filter(username=username).exists():
                username = f'{base}{counter}'
                counter += 1

            user = User.objects.create(
                username=username,
                email=email,
                first_name=data.get('given_name', ''),
                last_name=data.get('family_name', ''),
                is_active=True,
            )
            user.set_unusable_password()
            user.save()

            profile = user.profile
            profile.user_type = 'customer'
            profile.save(update_fields=['user_type'])

        refresh = RefreshToken.for_user(user)
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        })


class AdminSendNotificationView(APIView):
    """Send push notifications to users. Staff only.

    POST body:
      title          – notification title (required)
      body           – notification message (required)
      recipient_type – 'all' | 'customers' | 'riders' | 'admins' | 'test' (default: 'all')
      image_url      – optional image URL for rich notifications
      scheduled_for  – optional ISO8601 datetime for scheduling (not yet implemented)
      user_ids       – list of user IDs (when recipient_type is 'specific', optional)
    """
    permission_classes = [IsStaff]

    def post(self, request):
        from core.notifications import send_push_notification
        from accounts.models import NotificationHistory
        from django.utils import timezone

        title = (request.data.get('title') or '').strip()
        body = (request.data.get('body') or '').strip()
        recipient_type = request.data.get('recipient_type', 'all')
        image_url = (request.data.get('image_url') or '').strip() or None
        scheduled_for = request.data.get('scheduled_for')
        user_ids = request.data.get('user_ids', [])

        if not title:
            return Response({'title': 'Title is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not body:
            return Response({'body': 'Message body is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Test mode: send only to the requesting user
        if recipient_type == 'test':
            profile = request.user.profile
            if profile.expo_push_token:
                result = send_push_notification(
                    profile.expo_push_token,
                    title,
                    body,
                    data={'type': 'admin_test', 'image': image_url} if image_url else {'type': 'admin_test'}
                )
                sent = 1 if result else 0
                total = 1
            else:
                sent = 0
                total = 0
                
            # Log test notification
            NotificationHistory.objects.create(
                title=title,
                body=body,
                recipient_type='test',
                image_url=image_url,
                sent_by=request.user,
                sent_count=sent,
                total_devices=total,
                sent_at=timezone.now(),
            )
            
            return Response({
                'sent': sent,
                'total_tokens': total,
                'message': 'Test notification sent' if sent else 'No push token registered for your account'
            })

        # Normal sending logic
        qs = UserProfile.objects.exclude(expo_push_token__isnull=True).exclude(expo_push_token='')

        if recipient_type == 'customers':
            qs = qs.filter(user_type='customer')
        elif recipient_type == 'riders':
            qs = qs.filter(user_type='delivery_boy')
        elif recipient_type == 'admins':
            qs = qs.filter(
                Q(user__is_staff=True)
                | Q(user__is_superuser=True)
                | Q(user_type__in=['admin', 'staff'])
            )
        elif recipient_type == 'specific' and user_ids:
            qs = qs.filter(user__id__in=user_ids)

        tokens = list(qs.values_list('expo_push_token', flat=True))
        sent = 0
        
        # Prepare notification data
        notification_data = {'type': 'admin_broadcast'}
        if image_url:
            notification_data['image'] = image_url

        for token in tokens:
            result = send_push_notification(token, title, body, data=notification_data)
            if result:
                sent += 1

        # Save to history
        notification_history = NotificationHistory.objects.create(
            title=title,
            body=body,
            recipient_type=recipient_type,
            image_url=image_url,
            sent_by=request.user,
            sent_count=sent,
            total_devices=len(tokens),
            scheduled_for=scheduled_for,
            sent_at=timezone.now(),
        )

        activity_log(
            request.user, 'user', 'Push Notification Sent',
            target_type='broadcast', target_id=notification_history.id,
            target_label=f'{recipient_type} ({sent} sent)',
            details={'title': title, 'recipient_type': recipient_type, 'sent': sent},
        )

        return Response({'sent': sent, 'total_tokens': len(tokens)})


class AdminNotificationHistoryView(APIView):
    """Get notification history with statistics. Staff only."""
    permission_classes = [IsStaff]

    def get(self, request):
        from accounts.models import NotificationHistory

        # Get query parameters for filtering
        recipient_type = request.query_params.get('recipient_type')
        limit = int(request.query_params.get('limit', 50))

        qs = NotificationHistory.objects.select_related('sent_by').all()

        if recipient_type and recipient_type != 'all':
            qs = qs.filter(recipient_type=recipient_type)

        # Limit results
        qs = qs[:limit]

        data = []
        for notification in qs:
            data.append({
                'id': notification.id,
                'title': notification.title,
                'body': notification.body,
                'recipient_type': notification.recipient_type,
                'image_url': notification.image_url,
                'sent_count': notification.sent_count,
                'total_devices': notification.total_devices,
                'success_rate': notification.success_rate,
                'scheduled_for': notification.scheduled_for.isoformat() if notification.scheduled_for else None,
                'created_at': notification.created_at.isoformat(),
                'sent_at': notification.sent_at.isoformat() if notification.sent_at else None,
                'sent_by': notification.sent_by.username if notification.sent_by else None,
            })

        return Response(data)


# ── Notification templates (CRUD) ────────────────────────────────────────────

class NotificationTemplateListCreateView(generics.ListCreateAPIView):
    """List all saved notification templates / create a new one. Staff only."""
    permission_classes = [IsStaff]
    serializer_class = NotificationTemplateSerializer
    queryset = NotificationTemplate.objects.select_related('created_by').all()

    def perform_create(self, serializer):
        template = serializer.save(created_by=self.request.user)
        activity_log(
            self.request.user, 'user', 'Notification Template Created',
            target_type='notification_template', target_id=template.id,
            target_label=template.name,
        )


class NotificationTemplateDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve / update / delete a single notification template. Staff only."""
    permission_classes = [IsStaff]
    serializer_class = NotificationTemplateSerializer
    queryset = NotificationTemplate.objects.select_related('created_by').all()

    def perform_destroy(self, instance):
        label = instance.name
        tid = instance.id
        instance.delete()
        activity_log(
            self.request.user, 'user', 'Notification Template Deleted',
            target_type='notification_template', target_id=tid,
            target_label=label,
        )


# ── Mobile profile field config ──────────────────────────────────────────────

class MobileProfileConfigView(APIView):
    """Returns the field visibility/editability config for the current user's type."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user_type = getattr(request.user, 'profile', None)
        user_type = user_type.user_type if user_type else 'customer'
        if user_type not in ('delivery_boy', 'staff'):
            return Response({'user_type': user_type, 'fields': {}})
        return Response({
            'user_type': user_type,
            'fields': MobileProfileConfig.for_type(user_type),
        })


class AdminMobileProfileConfigView(APIView):
    """Admin GET all configs / PATCH a specific user_type config."""
    permission_classes = [IsStaff]

    def get(self, request):
        result = {}
        for ut in ('delivery_boy', 'staff'):
            result[ut] = MobileProfileConfig.for_type(ut)
        return Response(result)

    def patch(self, request, user_type):
        if user_type not in ('delivery_boy', 'staff'):
            return Response({'detail': 'Invalid user_type.'}, status=status.HTTP_400_BAD_REQUEST)

        fields_update = request.data.get('fields', {})
        if not isinstance(fields_update, dict):
            return Response({'detail': 'fields must be an object.'}, status=status.HTTP_400_BAD_REQUEST)

        obj, _ = MobileProfileConfig.objects.get_or_create(user_type=user_type)
        # Merge: only store overrides vs defaults
        defaults = PROFILE_FIELD_DEFAULTS.get(user_type, {})
        current = dict(obj.fields_config)
        for field_key, new_vals in fields_update.items():
            if field_key not in defaults:
                continue
            if field_key not in current:
                current[field_key] = {}
            current[field_key].update({
                k: v for k, v in new_vals.items() if k in ('visible', 'editable')
            })
        obj.fields_config = current
        obj.save()
        return Response({'user_type': user_type, 'fields': obj.get_config()})


# ─── Rider location tracking ─────────────────────────────────────────────────

# Bounds one offline flush. At the 60s default interval this is over three
# hours of queued fixes, and it keeps a single request from being unbounded.
MAX_BATCH_PINGS = 200

# Trails get their own caps: a whole day at the 60s default is 1440 points, so
# the usual 500 ceiling would silently cut a route in half.
TRAIL_DEFAULT_LIMIT = 500
TRAIL_MAX_LIMIT = 2000

LOCATION_DEFAULT_LIMIT = 100
LOCATION_MAX_LIMIT = 500


class IsDeliveryBoy(BasePermission):
    """Grants access only to authenticated users whose profile is user_type='delivery_boy'."""
    message = "Only delivery boys can access this endpoint."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        try:
            return request.user.profile.user_type == 'delivery_boy'
        except UserProfile.DoesNotExist:
            return False


class RiderLocationThrottle(UserRateThrottle):
    """
    Location reports are orders of magnitude more frequent than any other call,
    so they get their own budget rather than eating the shared 100/minute user
    rate. Setting throttle_classes on the view REPLACES the defaults, so that
    cap no longer applies here.
    """
    scope = 'rider_location'


def _paginate(request, default_limit, max_limit):
    """limit/offset for the `{count, results}` shape the other apps return."""
    try:
        limit = min(int(request.query_params.get('limit', default_limit)), max_limit)
    except (TypeError, ValueError):
        limit = default_limit
    try:
        offset = max(int(request.query_params.get('offset', 0)), 0)
    except (TypeError, ValueError):
        offset = 0
    return max(limit, 0), offset


@transaction.atomic
def _store_rider_fixes(rider, fixes):
    """Append every fix to the trail, then move the pin to the newest of them."""
    RiderLocationPing.objects.bulk_create([
        RiderLocationPing(
            rider=rider,
            latitude=fix['latitude'],
            longitude=fix['longitude'],
            accuracy_m=fix.get('accuracy_m'),
            recorded_at=fix['recorded_at'],
        )
        for fix in fixes
    ])

    newest = max(fixes, key=lambda fix: fix['recorded_at'])
    current = RiderLocation.objects.select_for_update().filter(rider=rider).first()
    # A queue flushed out of order, or a late duplicate, must never drag the
    # pin backwards in time.
    if current and current.recorded_at >= newest['recorded_at']:
        return current

    location, _ = RiderLocation.objects.update_or_create(
        rider=rider,
        defaults={
            'latitude': newest['latitude'],
            'longitude': newest['longitude'],
            'accuracy_m': newest.get('accuracy_m'),
            'speed_kmh': newest.get('speed_kmh'),
            'heading': newest.get('heading'),
            'battery_level': newest.get('battery_level'),
            'is_moving': newest.get('is_moving', False),
            'recorded_at': newest['recorded_at'],
        },
    )
    return location


class RiderLocationView(APIView):
    """
    POST /api/auth/rider/location/ — a rider reports their own position.

    The body may be a single fix, a bare list of fixes, or {"pings": [...]},
    so an app that was offline can flush its whole queue in one request.

    Writes NO activity log on purpose: at one fix a minute per rider it would
    bury every real business event in the log.
    """
    permission_classes = [IsDeliveryBoy]
    throttle_classes = [RiderLocationThrottle]

    def post(self, request):
        rows = request.data
        if isinstance(rows, dict):
            rows = rows['pings'] if 'pings' in rows else [rows]
        if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
            return Response(
                {'detail': 'Expected a location object or a list of location objects.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not rows:
            return Response(
                {'detail': 'No locations supplied.'}, status=status.HTTP_400_BAD_REQUEST,
            )
        if len(rows) > MAX_BATCH_PINGS:
            return Response(
                {'detail': f'At most {MAX_BATCH_PINGS} locations per request.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = RiderLocationPingInputSerializer(data=rows, many=True)
        payload.is_valid(raise_exception=True)
        fixes = payload.validated_data

        current = _store_rider_fixes(request.user, fixes)
        return Response(
            {
                'accepted': len(fixes),
                'current': RiderLocationEchoSerializer(current).data,
            },
            status=status.HTTP_201_CREATED,
        )


class AdminRiderLocationListView(APIView):
    """
    GET /api/auth/admin/riders/locations/
    Every rider who has a known position, freshest first.

    Query params:
        limit   — default 100, max 500
        offset  — default 0
    """
    permission_classes = [IsStaff]

    def get(self, request):
        from orders.models import Order  # local import keeps accounts import-light

        qs = (
            RiderLocation.objects
            .select_related('rider', 'rider__profile')
            .order_by('-recorded_at')
        )
        total = qs.count()
        limit, offset = _paginate(request, LOCATION_DEFAULT_LIMIT, LOCATION_MAX_LIMIT)
        rows = list(qs[offset:offset + limit])

        # One grouped query for the whole page instead of one per rider.
        active_orders = {
            row['assigned_delivery_boy__user_id']: row['open_count']
            for row in Order.objects
            .filter(assigned_delivery_boy__user_id__in=[row.rider_id for row in rows])
            .exclude(status__in=['Delivered', 'Cancelled'])
            .values('assigned_delivery_boy__user_id')
            .annotate(open_count=Count('id'))
        }

        data = RiderLocationSerializer(
            rows, many=True, context={'active_orders': active_orders},
        ).data
        return Response({
            'count': total, 'results': data, 'limit': limit, 'offset': offset,
        })


class AdminRiderTrailView(APIView):
    """
    GET /api/auth/admin/riders/<user_id>/trail/
    One rider's breadcrumb trail, oldest first so it can be handed straight to
    a polyline.

    `user_id` is the Django User id — the `rider_id` from the locations list,
    NOT the UserProfile id the staff endpoints use.

    Query params:
        date    — YYYY-MM-DD; a whole local (Asia/Karachi) calendar day
        since   — ISO timestamp; ignored when `date` is given
        limit   — default 500, max 2000
        offset  — default 0

    With neither `date` nor `since`, today is returned.
    """
    permission_classes = [IsStaff]

    def get(self, request, user_id):
        rider = get_object_or_404(User, pk=user_id)
        qs = RiderLocationPing.objects.filter(rider=rider)

        raw_date = request.query_params.get('date')
        raw_since = request.query_params.get('since')
        if raw_since and not raw_date:
            since = parse_datetime(raw_since)
            if since is None:
                return Response(
                    {'detail': 'since must be an ISO timestamp.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if timezone.is_naive(since):
                since = timezone.make_aware(since)
            qs = qs.filter(recorded_at__gte=since)
        else:
            try:
                day = (
                    datetime.strptime(raw_date, '%Y-%m-%d').date()
                    if raw_date else timezone.localdate()
                )
            except ValueError:
                return Response(
                    {'detail': 'date must be YYYY-MM-DD.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # Local day boundaries: the pre-dawn delivery round belongs to the
            # Pakistan calendar day, not the UTC one.
            start = timezone.make_aware(datetime.combine(day, time.min))
            qs = qs.filter(
                recorded_at__gte=start, recorded_at__lt=start + timedelta(days=1),
            )

        total = qs.count()
        limit, offset = _paginate(request, TRAIL_DEFAULT_LIMIT, TRAIL_MAX_LIMIT)
        rows = qs.order_by('recorded_at')[offset:offset + limit]
        return Response({
            'count': total,
            'results': RiderLocationPingSerializer(rows, many=True).data,
            'limit': limit,
            'offset': offset,
        })


class TrackingConfigView(APIView):
    """
    GET /api/auth/tracking-config/ — the tracking policy the app must obey.

    Readable by any authenticated user: the app fetches it right after login,
    before it necessarily knows whether this account is a rider.
    """
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        return Response(TrackingSettingsSerializer(TrackingSettings.load()).data)
