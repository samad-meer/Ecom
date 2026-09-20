import re
from datetime import timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.utils import timezone

from core.address import normalize_portion
from rest_framework.validators import UniqueValidator
from .models import (
    Area, CustomerAddress, DiscountCategory, UserProfile, NotificationTemplate,
    CUSTOMER_PIN_FIELDS, LOCATION_STALE_AFTER_MINUTES,
    RiderLocation, RiderLocationPing, TrackingSettings,
)
from activities.service import log_data_issue
from .permissions import user_can_override_discount
from .phone import duplicate_phone_error, normalize_phone


class AreaSerializer(serializers.ModelSerializer):
    """Admin-managed delivery localities offered on the signup form."""

    class Meta:
        model = Area
        fields = ('id', 'name', 'is_active', 'order')

    def validate_name(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Area name is required.')
        # Case-insensitive uniqueness — "Johar Town" and "johar town" are the
        # same place to a customer picking from a dropdown.
        qs = Area.objects.filter(name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('That area already exists.')
        return value

class DiscountCategorySerializer(serializers.ModelSerializer):
    """Admin-managed customer discount tiers. Staff-only — customers never see these."""

    customer_count = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = DiscountCategory
        fields = (
            'id', 'name', 'discount_type', 'discount_value', 'is_active',
            'description', 'customer_count', 'created_at', 'updated_at',
        )

    def get_customer_count(self, obj):
        return obj.customers.count()

    def validate_name(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Category name is required.')
        # Case-insensitive uniqueness, same reasoning as Area: "wholesale" and
        # "Wholesale" are the same tier in a dropdown.
        qs = DiscountCategory.objects.filter(name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('That discount category already exists.')
        return value

    def validate_discount_value(self, value):
        if value < 0:
            raise serializers.ValidationError('Discount value cannot be negative.')
        return value

    def validate(self, attrs):
        # MySQL/MariaDB may ignore CHECK constraints, so the percentage cap is
        # enforced here, in Python.
        discount_type = attrs.get(
            'discount_type', getattr(self.instance, 'discount_type', DiscountCategory.FIXED)
        )
        discount_value = attrs.get(
            'discount_value', getattr(self.instance, 'discount_value', None)
        )
        if (discount_type == DiscountCategory.PERCENTAGE
                and discount_value is not None and discount_value > 100):
            raise serializers.ValidationError(
                {'discount_value': 'A percentage discount cannot exceed 100.'}
            )
        return attrs


def normalize_phone_number(value):
    """Strip separators and return the number in local 03xxxxxxxxx form.

    The rule itself lives in `accounts.phone` so the admin views and the
    backfill migration share one definition; this is only the raising wrapper
    that DRF field validation wants.
    """
    normalized = normalize_phone(value)
    if normalized is None:
        raise serializers.ValidationError(
            'Enter a valid mobile number, e.g. 0300-1234567.'
        )
    return normalized


# ── Coordinates (shared by rider tracking and the customer delivery pin) ─────

COORDINATE_QUANTUM = Decimal('0.000001')


class _CoordinateField(serializers.DecimalField):
    """
    Takes whatever precision the GPS chip reports and rounds it to 6 dp.

    Declaring decimal_places=6 here would 400 a perfectly good fix like
    31.52037777 for being *too* precise, so precision is left open and the
    value is quantized on the way in instead.
    """

    def __init__(self, **kwargs):
        super().__init__(max_digits=None, decimal_places=None, **kwargs)

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        try:
            return value.quantize(COORDINATE_QUANTUM, rounding=ROUND_HALF_UP)
        except InvalidOperation:
            # With max_digits open, an absurd exponent ("1E+400") or a
            # 30-plus-digit integer survives the parent's parsing and blows up
            # quantize instead — that is a bad request, not a server error.
            self.fail('invalid')


def _pin_coordinate(**kwargs):
    """A customer-pin latitude/longitude input field with the range checked in
    Python — MariaDB may ignore CHECK constraints, so this is the real guard."""
    bound = kwargs.pop('bound')
    return _CoordinateField(
        min_value=Decimal(-bound), max_value=Decimal(bound), **kwargs
    )


def validate_pin_pair(attrs):
    """A delivery pin only means anything as a complete pair — reject a lone
    latitude whether the other half is missing or explicitly null."""
    if (('customer_latitude' in attrs) != ('customer_longitude' in attrs)
            or (attrs.get('customer_latitude') is None)
            != (attrs.get('customer_longitude') is None)):
        raise serializers.ValidationError({
            'customer_location':
                'Provide customer_latitude and customer_longitude together.'
        })


class CustomerLocationInputSerializer(serializers.Serializer):
    """The pin a rider or staff member drops for a customer — both halves required."""

    customer_latitude = _pin_coordinate(bound=90)
    customer_longitude = _pin_coordinate(bound=180)


class NotificationTemplateSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = NotificationTemplate
        fields = (
            'id', 'name', 'title', 'body', 'recipient_type',
            'created_by_name', 'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'created_by_name', 'created_at', 'updated_at')

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return None

    def validate_name(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Template name is required.')
        return value

    def validate_title(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Title is required.')
        return value

    def validate_body(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Message is required.')
        return value


class UpdateProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(
        required=False,
        validators=[UniqueValidator(queryset=User.objects.all(), message="Username already taken.")],
    )
    phone_number = serializers.CharField(
        source='profile.phone_number', allow_blank=True, allow_null=True, required=False
    )
    address = serializers.CharField(
        source='profile.address', allow_blank=True, allow_null=True, required=False
    )
    house_number = serializers.CharField(
        source='profile.house_number', allow_blank=True, allow_null=True, required=False
    )
    portion = serializers.CharField(
        source='profile.portion', allow_blank=True, allow_null=True, required=False
    )
    block = serializers.CharField(
        source='profile.block', allow_blank=True, allow_null=True, required=False
    )
    area = serializers.CharField(
        source='profile.area', allow_blank=True, allow_null=True, required=False
    )
    work_place_label = serializers.CharField(
        source='profile.work_place_label', allow_blank=True, required=False,
        max_length=120,
    )
    # The customer's own delivery pin. No source=: pin writes go through
    # set_customer_pin so source/set_by/set_at always move with the coordinates.
    customer_latitude = _pin_coordinate(
        bound=90, required=False, allow_null=True, write_only=True,
    )
    customer_longitude = _pin_coordinate(
        bound=180, required=False, allow_null=True, write_only=True,
    )

    def validate_phone_number(self, value):
        """Same rule as signup — a customer must not edit their way onto
        somebody else's number, and the stored form must stay canonical or the
        duplicate check goes blind."""
        if not value:
            return value
        normalized = normalize_phone_number(value)
        user = getattr(self, 'instance', None)
        if duplicate_phone_error(normalized, exclude_user_id=user.pk if user else None):
            raise serializers.ValidationError(
                'This number is already registered to another account.'
            )
        return normalized

    class Meta:
        model = User
        fields = (
            'username', 'first_name', 'last_name', 'email', 'phone_number',
            'address', 'house_number', 'portion', 'block', 'area',
            'work_place_label',
            'customer_latitude', 'customer_longitude',
        )
        extra_kwargs = {
            'email': {'required': False},
            'first_name': {'required': False},
            'last_name': {'required': False},
        }

    def validate(self, attrs):
        validate_pin_pair(attrs)
        return attrs

    def update(self, instance, validated_data):
        profile_data = validated_data.pop('profile', {})
        has_pin = 'customer_latitude' in validated_data
        latitude = validated_data.pop('customer_latitude', None)
        longitude = validated_data.pop('customer_longitude', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if profile_data or has_pin:
            profile = instance.profile
            for attr, value in profile_data.items():
                setattr(profile, attr, value)
            # A structured part changed and no explicit address was sent —
            # rebuild the display address from the parts.
            if 'address' not in profile_data and any(
                k in profile_data for k in ('house_number', 'portion', 'block', 'area')
            ):
                profile.sync_address()
            if has_pin:
                # Their own claim — null/null clears the pin entirely.
                profile.set_customer_pin(
                    latitude, longitude, source='customer', set_by=instance,
                )
            profile.save()
        return instance


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(
        required=True, write_only=True, validators=[validate_password], min_length=8
    )

    def validate_old_password(self, value):
        if not self.context['request'].user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value


# Character rules every password in the system must satisfy. Kept as data so
# the signup serializer and the admin "add customer" endpoint enforce exactly
# the same policy — those two used to disagree, with admin-created accounts
# accepting a 6-character password and no character requirements at all.
PASSWORD_RULES = (
    (lambda p: len(p) >= 8, 'Password must be at least 8 characters.'),
    (lambda p: any(c.isdigit() for c in p), 'Password must contain at least one digit.'),
    (lambda p: any(c.isupper() for c in p), 'Password must contain at least one uppercase letter.'),
    (lambda p: any(c.islower() for c in p), 'Password must contain at least one lowercase letter.'),
    (lambda p: any(not c.isalnum() for c in p), 'Password must contain at least one special character.'),
)


def password_policy_error(password):
    """Return the first unmet password rule, or None if the password passes."""
    for passes, message in PASSWORD_RULES:
        if not passes(password):
            return message
    return None


class CustomerAddressSerializer(serializers.ModelSerializer):
    """A customer's saved address, with its optional delivery pin."""

    display_label = serializers.CharField(read_only=True)
    has_pin = serializers.BooleanField(read_only=True)
    # Plain string rather than the model's ChoiceField: an older client sending
    # 'Ground Floor' should be normalised, not rejected outright on an optional
    # field. validate_portion below maps it onto the canonical key.
    portion = serializers.CharField(
        required=False, allow_blank=True, default='', max_length=50,
    )

    class Meta:
        model = CustomerAddress
        fields = [
            'id', 'label', 'custom_label', 'display_label',
            'house_number', 'portion', 'block', 'area', 'address',
            'latitude', 'longitude', 'has_pin',
            'is_default', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'address', 'created_at', 'updated_at']

    def validate_portion(self, value):
        return normalize_portion(value)

    def validate(self, attrs):
        # A pin is a pair or nothing: half a coordinate puts a rider in the sea.
        lat = attrs.get('latitude', getattr(self.instance, 'latitude', None))
        lng = attrs.get('longitude', getattr(self.instance, 'longitude', None))
        if (lat is None) != (lng is None):
            raise serializers.ValidationError(
                {'latitude': 'Send latitude and longitude together, or neither.'}
            )

        def value_for(field):
            if field in attrs:
                return (attrs.get(field) or '').strip()
            return (getattr(self.instance, field, '') or '').strip()

        if not value_for('house_number'):
            raise serializers.ValidationError({'house_number': 'This field is required.'})
        if not value_for('area'):
            raise serializers.ValidationError({'area': 'This field is required.'})
        return attrs


class RegisterSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(
        required=True,
        # DRF's default here is "This field must be unique." — which names
        # neither the field nor what to do about it. A duplicate email means
        # this person already has an account, so say that and point them at
        # the way out.
        validators=[UniqueValidator(
            queryset=User.objects.all(),
            message='This email already has an account. Try signing in instead.',
        )],
    )
    password = serializers.CharField(
        write_only=True, required=True, validators=[validate_password], min_length=8
    )
    password_confirm = serializers.CharField(write_only=True, required=True)
    phone_number = serializers.CharField(write_only=True, required=True)
    house_number = serializers.CharField(write_only=True, required=True, max_length=50)
    portion = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default='', max_length=50
    )
    block = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default='', max_length=100
    )
    area = serializers.CharField(write_only=True, required=True, max_length=150)
    # Optional delivery pin dropped on the signup map.
    customer_latitude = _pin_coordinate(
        bound=90, required=False, allow_null=True, write_only=True,
    )
    customer_longitude = _pin_coordinate(
        bound=180, required=False, allow_null=True, write_only=True,
    )

    class Meta:
        model = User
        fields = (
            'username', 'email', 'password', 'password_confirm',
            'first_name', 'last_name',
            'phone_number', 'house_number', 'portion', 'block', 'area',
            'customer_latitude', 'customer_longitude',
        )
        extra_kwargs = {
            'first_name': {'required': False},
            'last_name': {'required': False},
        }

    def validate_phone_number(self, value):
        """One number, one customer.

        A number already on file means this person is almost certainly the
        walk-in or phone customer an admin entered earlier, and letting the
        signup through would split them into two accounts — two ledgers, two
        balances, and an app showing zero to someone who owes money.
        """
        normalized = normalize_phone_number(value)
        duplicate = duplicate_phone_error(normalized)
        if duplicate:
            # Worth an admin's attention, and not as a nuisance: someone whose
            # number is already on file is almost always a customer the office
            # entered by hand, now trying to get into the app. The row tells
            # the admin who to give a password to.
            #
            # A plain typo at signup is deliberately NOT logged — the customer
            # retypes it a second later, and logging every mistyped digit from
            # a public form would bury the rows that need acting on.
            log_data_issue(
                None, 'Existing Customer Tried To Sign Up',
                target_type='customer',
                target_id=duplicate['existing_customer']['id'],
                target_label=duplicate['existing_customer']['name'],
                details={
                    'phone': normalized,
                    'chose_username': self.initial_data.get('username', ''),
                    'where': 'signup',
                },
            )
            raise serializers.ValidationError(
                'An account already exists for this number. Please sign in, or '
                'contact us if you have not set a password yet.'
            )
        return normalized

    def validate_portion(self, value):
        """Accept any spelling, store the canonical key.

        Not a strict ChoiceField: an older client sending 'Ground' should still
        register successfully rather than 400 on an optional field.
        """
        return normalize_portion(value)

    def validate(self, attrs):
        validate_pin_pair(attrs)
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({"password": "Password fields didn't match."})
        policy_error = password_policy_error(attrs['password'])
        if policy_error:
            raise serializers.ValidationError({"password": policy_error})
        return attrs

    def create(self, validated_data):
        user = User.objects.create(
            username=validated_data['username'],
            email=validated_data['email'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            is_active=True,
        )
        user.set_password(validated_data['password'])
        user.save()
        profile = user.profile
        profile.user_type = 'customer'
        profile.phone_number = validated_data['phone_number']
        profile.house_number = validated_data['house_number'].strip()
        profile.portion = (validated_data.get('portion') or '').strip()
        profile.block = (validated_data.get('block') or '').strip()
        profile.area = validated_data['area'].strip()
        profile.sync_address()
        update_fields = [
            'user_type', 'phone_number', 'house_number', 'portion',
            'block', 'area', 'address',
        ]
        if validated_data.get('customer_latitude') is not None:
            profile.set_customer_pin(
                validated_data['customer_latitude'],
                validated_data['customer_longitude'],
                source='customer', set_by=user,
            )
            update_fields += CUSTOMER_PIN_FIELDS
        profile.save(update_fields=update_fields)

        # The address the customer just typed becomes their first address-book
        # entry, marked default.
        #
        # Without this it lived only on the profile, so checkout — which reads
        # the address book — told a customer who had just given their full
        # address "You have no saved addresses yet" and made them type it all
        # again before they could order. The pin they dropped at signup was
        # stranded the same way.
        CustomerAddress.objects.create(
            user=user,
            label=CustomerAddress.LABEL_HOME,
            house_number=profile.house_number or '',
            portion=profile.portion or '',
            block=profile.block or '',
            area=profile.area or '',
            address=profile.address or '',
            latitude=profile.customer_latitude,
            longitude=profile.customer_longitude,
            is_default=True,
        )
        return user


# ─── Staff / Rider serializers ────────────────────────────────────────────────

class StaffProfileSerializer(serializers.ModelSerializer):
    """Full staff profile with optional rider delivery stats — staff-admin only."""
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)
    full_name = serializers.SerializerMethodField()
    is_active = serializers.BooleanField(source='user.is_active', read_only=True)
    last_login = serializers.DateTimeField(source='user.last_login', read_only=True)
    date_joined = serializers.DateTimeField(source='user.date_joined', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    age = serializers.SerializerMethodField()
    total_deliveries = serializers.SerializerMethodField()
    delivered_count = serializers.SerializerMethodField()
    profile_picture_url = serializers.SerializerMethodField()
    cnic_front_url = serializers.SerializerMethodField()
    cnic_back_url = serializers.SerializerMethodField()
    driving_license_url = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = [
            'id', 'user_id', 'username', 'email', 'first_name', 'last_name', 'full_name',
            'is_active', 'last_login', 'date_joined', 'created_by_name',
            'phone_number', 'address', 'is_available',
            # Rider-specific
            'is_rider', 'vehicle_type', 'vehicle_number',
            # HR fields
            'employee_id', 'cnic_number', 'date_of_birth', 'age', 'date_of_joining',
            'working_status', 'emergency_contact', 'department', 'designation',
            'salary', 'remarks',
            # Media
            'profile_picture_url', 'cnic_front_url', 'cnic_back_url', 'driving_license_url',
            # Stats (riders only)
            'total_deliveries', 'delivered_count',
        ]

    def get_full_name(self, obj):
        return obj.user.get_full_name() or obj.user.username

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return None

    def get_age(self, obj):
        return obj.age

    def get_total_deliveries(self, obj):
        if not obj.is_rider:
            return None
        return obj.assigned_orders.exclude(status='Cancelled').count()

    def get_delivered_count(self, obj):
        if not obj.is_rider:
            return None
        return obj.assigned_orders.filter(status='Delivered').count()

    def _abs_url(self, request, field_value):
        if not field_value:
            return None
        if request:
            return request.build_absolute_uri(field_value.url)
        return field_value.url

    def get_profile_picture_url(self, obj):
        return self._abs_url(self.context.get('request'), obj.profile_picture)

    def get_cnic_front_url(self, obj):
        return self._abs_url(self.context.get('request'), obj.cnic_front)

    def get_cnic_back_url(self, obj):
        return self._abs_url(self.context.get('request'), obj.cnic_back)

    def get_driving_license_url(self, obj):
        return self._abs_url(self.context.get('request'), obj.driving_license)


class CreateStaffSerializer(serializers.Serializer):
    """Creates a Django user as a staff member (rider or non-rider)."""
    username = serializers.CharField()
    email = serializers.EmailField(required=False, allow_blank=True, default='')
    password = serializers.CharField(write_only=True, min_length=6)
    first_name = serializers.CharField(required=False, allow_blank=True, default='')
    last_name = serializers.CharField(required=False, allow_blank=True, default='')
    phone_number = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)
    # Rider
    is_rider = serializers.BooleanField(required=False, default=False)
    vehicle_type = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)
    vehicle_number = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)
    # HR
    employee_id = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)
    cnic_number = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)
    date_of_birth = serializers.DateField(required=False, allow_null=True, default=None)
    date_of_joining = serializers.DateField(required=False, allow_null=True, default=None)
    working_status = serializers.ChoiceField(
        choices=UserProfile.WORKING_STATUS_CHOICES, required=False, default='Active'
    )
    emergency_contact = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)
    department = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)
    designation = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)
    salary = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True, default=None)
    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)
    address = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Username already taken.")
        return value

    def validate_employee_id(self, value):
        if value and UserProfile.objects.filter(employee_id=value).exists():
            raise serializers.ValidationError("Employee ID already in use.")
        return value

    def create(self, validated_data):
        is_rider = validated_data.pop('is_rider', False)
        profile_fields = [
            'phone_number', 'vehicle_type', 'vehicle_number', 'employee_id', 'cnic_number',
            'date_of_birth', 'date_of_joining', 'working_status', 'emergency_contact',
            'department', 'designation', 'salary', 'remarks', 'address',
        ]
        profile_data = {k: validated_data.pop(k) for k in profile_fields if k in validated_data}
        password = validated_data.pop('password')
        user = User.objects.create(**validated_data)
        user.set_password(password)
        user.save()
        profile = user.profile
        profile.is_rider = is_rider
        profile.user_type = 'delivery_boy' if is_rider else 'staff'
        for attr, value in profile_data.items():
            if value is not None or attr in ('date_of_birth', 'date_of_joining', 'salary'):
                setattr(profile, attr, value)
        profile.save()
        return profile


class UpdateStaffSerializer(serializers.Serializer):
    """PATCH updates to a staff member — user fields + all profile fields."""
    username = serializers.CharField(required=False)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)

    def validate_username(self, value):
        if value:
            qs = User.objects.filter(username=value)
            if self.instance:
                qs = qs.exclude(pk=self.instance.user.pk)
            if qs.exists():
                raise serializers.ValidationError("Username already taken.")
        return value
    phone_number = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    address = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    # Rider
    is_rider = serializers.BooleanField(required=False)
    is_available = serializers.BooleanField(required=False)
    vehicle_type = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    vehicle_number = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    # HR
    employee_id = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    cnic_number = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    date_of_joining = serializers.DateField(required=False, allow_null=True)
    working_status = serializers.ChoiceField(choices=UserProfile.WORKING_STATUS_CHOICES, required=False)
    emergency_contact = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    department = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    designation = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    salary = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate_employee_id(self, value):
        if value:
            qs = UserProfile.objects.filter(employee_id=value)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError("Employee ID already in use.")
        return value

    def update(self, profile, validated_data):
        user_fields = ['username', 'first_name', 'last_name', 'email', 'is_active']
        user_data = {k: validated_data.pop(k) for k in user_fields if k in validated_data}
        if user_data:
            for attr, value in user_data.items():
                setattr(profile.user, attr, value)
            profile.user.save()
        # Sync user_type from is_rider if provided
        is_rider = validated_data.pop('is_rider', None)
        if is_rider is not None:
            profile.is_rider = is_rider
            profile.user_type = 'delivery_boy' if is_rider else 'staff'
        for attr, value in validated_data.items():
            setattr(profile, attr, value)
        profile.save()
        return profile


# ─── Legacy aliases (kept for mobile app compatibility) ───────────────────────

RiderProfileSerializer = StaffProfileSerializer
CreateRiderSerializer = CreateStaffSerializer
UpdateRiderSerializer = UpdateStaffSerializer


# ─── User (self-profile) serializer ──────────────────────────────────────────

class UserSerializer(serializers.ModelSerializer):
    user_type = serializers.CharField(source='profile.user_type', read_only=True)
    phone_number = serializers.CharField(source='profile.phone_number', read_only=True)
    address = serializers.CharField(source='profile.address', read_only=True)
    house_number = serializers.CharField(source='profile.house_number', read_only=True)
    portion = serializers.CharField(source='profile.portion', read_only=True)
    block = serializers.CharField(source='profile.block', read_only=True)
    area = serializers.CharField(source='profile.area', read_only=True)
    work_place_label = serializers.CharField(source='profile.work_place_label', read_only=True)
    is_available = serializers.BooleanField(source='profile.is_available', read_only=True)
    # Their OWN delivery pin — numbers, not strings, for a Google Maps
    # LatLngLiteral. Other customers' pins are never reachable from here.
    customer_latitude = serializers.DecimalField(
        source='profile.customer_latitude', max_digits=9, decimal_places=6,
        coerce_to_string=False, read_only=True,
    )
    customer_longitude = serializers.DecimalField(
        source='profile.customer_longitude', max_digits=10, decimal_places=6,
        coerce_to_string=False, read_only=True,
    )
    vehicle_type = serializers.CharField(source='profile.vehicle_type', read_only=True)
    vehicle_number = serializers.CharField(source='profile.vehicle_number', read_only=True)
    account_balance = serializers.DecimalField(
        source='profile.account_balance', max_digits=12, decimal_places=2, read_only=True
    )
    is_staff = serializers.BooleanField(read_only=True)
    can_manage_plant = serializers.SerializerMethodField()
    can_override_discount = serializers.SerializerMethodField()
    # Staff / rider HR fields (null for customers)
    employee_id = serializers.CharField(source='profile.employee_id', read_only=True)
    designation = serializers.CharField(source='profile.designation', read_only=True)
    department = serializers.CharField(source='profile.department', read_only=True)
    emergency_contact = serializers.CharField(source='profile.emergency_contact', read_only=True)
    cnic_number = serializers.CharField(source='profile.cnic_number', read_only=True)
    date_of_birth = serializers.DateField(source='profile.date_of_birth', read_only=True)
    date_of_joining = serializers.DateField(source='profile.date_of_joining', read_only=True)
    salary = serializers.DecimalField(
        source='profile.salary', max_digits=12, decimal_places=2, read_only=True
    )
    remarks = serializers.CharField(source='profile.remarks', read_only=True)

    class Meta:
        model = User
        fields = (
            'id', 'username', 'email', 'first_name', 'last_name',
            'user_type', 'phone_number', 'address',
            'house_number', 'portion', 'block', 'area', 'work_place_label',
            'customer_latitude', 'customer_longitude', 'is_available',
            'vehicle_type', 'vehicle_number', 'account_balance',
            'is_staff', 'can_manage_plant', 'can_override_discount',
            'employee_id', 'designation', 'department', 'emergency_contact',
            'cnic_number', 'date_of_birth', 'date_of_joining', 'salary', 'remarks',
        )
        # NOTE: profile.discount_category is deliberately absent — a customer
        # must never learn their discount assignment from their own profile.

    def get_can_manage_plant(self, obj):
        return (
            obj.is_superuser
            or obj.is_staff
            or obj.has_perm('plant.view_deliveryrecord')
        )

    def get_can_override_discount(self, obj):
        return user_can_override_discount(obj)


# ── Rider location tracking ──────────────────────────────────────────────────

# A device clock a little ahead of ours is normal; hours ahead is a broken clock
# that would otherwise pin the rider in the future and keep them forever fresh.
CLOCK_SKEW_TOLERANCE = timedelta(minutes=5)


def _unknown_if_negative(value):
    """
    expo-location reports -1 for accuracy, speed and heading it could not
    determine. Rejecting that would throw away an otherwise perfectly good fix,
    so a negative reading is stored as "unknown" instead.
    """
    return None if value is None or value < 0 else value


class RiderLocationPingInputSerializer(serializers.Serializer):
    """
    One reported fix.

    Deliberately has no rider/user field: the row written is always
    request.user's. Anything identifying a rider in the payload is ignored,
    so one rider can never move another rider's pin.
    """

    latitude = _CoordinateField(min_value=Decimal('-90'), max_value=Decimal('90'))
    longitude = _CoordinateField(min_value=Decimal('-180'), max_value=Decimal('180'))
    accuracy_m = serializers.FloatField(required=False, allow_null=True)
    speed_kmh = serializers.FloatField(required=False, allow_null=True)
    heading = serializers.FloatField(required=False, allow_null=True)
    battery_level = serializers.IntegerField(
        required=False, allow_null=True, min_value=0, max_value=100
    )
    is_moving = serializers.BooleanField(required=False, default=False)
    recorded_at = serializers.DateTimeField(required=False)

    def validate_accuracy_m(self, value):
        return _unknown_if_negative(value)

    def validate_speed_kmh(self, value):
        return _unknown_if_negative(value)

    def validate_heading(self, value):
        value = _unknown_if_negative(value)
        return value % 360 if value is not None else None

    def validate_recorded_at(self, value):
        if value > timezone.now() + CLOCK_SKEW_TOLERANCE:
            raise serializers.ValidationError('recorded_at is in the future.')
        # Anything past the retention window would be pruned on arrival anyway,
        # and a badly wrong device clock must not be able to smear a trail
        # backwards through history. Cached on the serializer: with many=True
        # one child instance validates the whole batch.
        if not hasattr(self, '_oldest_accepted'):
            retention = TrackingSettings.load().trail_retention_days
            self._oldest_accepted = timezone.now() - timedelta(days=retention)
        if value < self._oldest_accepted:
            raise serializers.ValidationError(
                'recorded_at is older than the trail retention window.'
            )
        return value

    def validate(self, attrs):
        # Omitting recorded_at means "right now" — the common case for a live
        # ping, where only a queued/offline flush carries its own timestamp.
        if not attrs.get('recorded_at'):
            attrs['recorded_at'] = timezone.now()
        return attrs


class RiderLocationEchoSerializer(serializers.ModelSerializer):
    """
    What the rider's own device gets back after reporting: just enough to
    confirm which fix won, with none of the admin-only rider detail.
    """

    # Numbers, not strings. A Google Maps LatLngLiteral needs numbers, and a
    # quoted coordinate fails silently as a pin that never appears.
    latitude = serializers.DecimalField(
        max_digits=9, decimal_places=6, coerce_to_string=False, read_only=True
    )
    longitude = serializers.DecimalField(
        max_digits=10, decimal_places=6, coerce_to_string=False, read_only=True
    )

    class Meta:
        model = RiderLocation
        fields = ['latitude', 'longitude', 'recorded_at', 'received_at']


class RiderLocationSerializer(serializers.ModelSerializer):
    """A rider's current pin as the admin map consumes it."""

    rider_id = serializers.IntegerField(source='rider.id', read_only=True)
    profile_id = serializers.SerializerMethodField()
    username = serializers.CharField(source='rider.username', read_only=True)
    name = serializers.SerializerMethodField()
    phone = serializers.SerializerMethodField()
    vehicle_number = serializers.SerializerMethodField()
    is_available = serializers.SerializerMethodField()
    latitude = serializers.DecimalField(
        max_digits=9, decimal_places=6, coerce_to_string=False, read_only=True
    )
    longitude = serializers.DecimalField(
        max_digits=10, decimal_places=6, coerce_to_string=False, read_only=True
    )
    is_stale = serializers.BooleanField(read_only=True)
    minutes_ago = serializers.FloatField(read_only=True)
    active_orders = serializers.SerializerMethodField()

    class Meta:
        model = RiderLocation
        fields = [
            'rider_id', 'profile_id', 'username', 'name', 'phone', 'vehicle_number',
            'is_available', 'latitude', 'longitude', 'accuracy_m', 'speed_kmh',
            'heading', 'battery_level', 'is_moving', 'recorded_at', 'received_at',
            'is_stale', 'minutes_ago', 'active_orders',
        ]

    def _profile(self, obj):
        return getattr(obj.rider, 'profile', None)

    def get_profile_id(self, obj):
        profile = self._profile(obj)
        return profile.id if profile else None

    def get_name(self, obj):
        return obj.rider.get_full_name() or obj.rider.username

    def get_phone(self, obj):
        profile = self._profile(obj)
        return profile.phone_number if profile else None

    def get_vehicle_number(self, obj):
        profile = self._profile(obj)
        return profile.vehicle_number if profile else None

    def get_is_available(self, obj):
        profile = self._profile(obj)
        return profile.is_available if profile else None

    def get_active_orders(self, obj):
        # Counted once for the whole page and passed in via context; falling
        # back to 0 keeps a single-object render from firing a stray query.
        return self.context.get('active_orders', {}).get(obj.rider_id, 0)


class RiderLocationPingSerializer(serializers.ModelSerializer):
    """One breadcrumb on a rider's trail."""

    latitude = serializers.DecimalField(
        max_digits=9, decimal_places=6, coerce_to_string=False, read_only=True
    )
    longitude = serializers.DecimalField(
        max_digits=10, decimal_places=6, coerce_to_string=False, read_only=True
    )

    class Meta:
        model = RiderLocationPing
        # created_at alongside recorded_at: an offline flush arrives long after
        # the fix was taken, and admins need to see both clocks to tell a stale
        # queue from live reporting.
        fields = ['id', 'latitude', 'longitude', 'accuracy_m', 'recorded_at', 'created_at']


class TrackingSettingsSerializer(serializers.ModelSerializer):
    """The policy the mobile app fetches on login and obeys."""

    stale_after_minutes = serializers.SerializerMethodField()

    class Meta:
        model = TrackingSettings
        fields = [
            'tracking_enabled', 'tracking_mode', 'ping_interval_seconds',
            'ping_distance_meters', 'trail_retention_days',
            'stale_after_minutes', 'updated_at',
        ]

    def get_stale_after_minutes(self, obj):
        # Echoed so the web map and the app agree on when a pin goes grey
        # instead of each hard-coding its own threshold.
        return LOCATION_STALE_AFTER_MINUTES
