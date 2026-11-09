from datetime import datetime
from decimal import Decimal, InvalidOperation

from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import api_view, permission_classes
from django.contrib.auth.models import User
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.db.models import Q, Sum, Count
from .models import Order, DeliveryStatus, OrderItem, CustomerVisit
from .serializers import (
    OrderSerializer, DeliveryStatusSerializer, DeliveryBoyOrderSerializer,
    AdminOrderSerializer, AdminOrderUpdateSerializer, AdminOrderCreateSerializer,
    CustomerVisitSerializer, RiderVisitInputSerializer, rider_card_maps,
    AdminDeliveryStatusSerializer,
)
from core.timeframes import scope_to_days
from accounts.models import UserProfile
from accounts.permissions import user_can_override_discount
from activities.service import log as activity_log

class OrderListCreateView(generics.ListCreateAPIView):
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Order.objects.filter(user=self.request.user).order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class OrderDetailView(generics.RetrieveAPIView):
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = 'id'

    def get_queryset(self):
        return Order.objects.filter(user=self.request.user)

class IsDeliveryBoy(permissions.BasePermission):
    """Grants access only to authenticated users whose profile is user_type='delivery_boy'."""
    message = "Only delivery boys can access this endpoint."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        try:
            return request.user.profile.user_type == 'delivery_boy'
        except UserProfile.DoesNotExist:
            return False


class DeliveryBoyOrderListView(generics.ListAPIView):
    serializer_class = DeliveryBoyOrderSerializer
    permission_classes = [IsDeliveryBoy]

    def get_queryset(self):
        profile = self.request.user.profile
        return Order.objects.filter(
            assigned_delivery_boy=profile
        ).exclude(
            status__in=['Delivered', 'Cancelled']
        ).select_related(
            # assigned_delivery_boy is a UserProfile FK and its .user is read
            # when serializing; without both, each order re-queries them.
            'user', 'user__profile',
            'assigned_delivery_boy', 'assigned_delivery_boy__user',
        ).prefetch_related(
            # The product serializer nests its gallery, so stopping the
            # prefetch at the product costs one images query per order.
            'items__product__images'
        ).order_by('-created_at')

    def list(self, request, *args, **kwargs):
        # The customer-card lookups are batched for the whole page here —
        # a rider's list may hold dozens of orders and must stay O(1) queries.
        orders = list(self.get_queryset())
        context = self.get_serializer_context()
        context['rider_card_maps'] = rider_card_maps(orders)
        return Response(
            DeliveryBoyOrderSerializer(orders, many=True, context=context).data
        )


def _rider_online_amount(payload):
    """
    The amount a rider marked Online, or None if this submission is not that.

    Read from the shape the rider app has always sent (is_paid set, cash not
    received), so builds already on riders' phones work without an update.
    """
    if payload.get('cash_received') or not payload.get('is_paid'):
        return None
    try:
        amount = Decimal(str(payload.get('cash_amount') or 0))
    except InvalidOperation:
        return None
    return amount if amount > 0 else None


class DeliveryBoyOrderDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = DeliveryBoyOrderSerializer
    permission_classes = [IsDeliveryBoy]
    lookup_field = 'id'

    def get_queryset(self):
        return Order.objects.filter(
            assigned_delivery_boy=self.request.user.profile
        ).select_related('user', 'user__profile').prefetch_related('items__product')
    
    def update(self, request, *args, **kwargs):
        instance = self.get_object()

        # A rider gets exactly one submission per order, and that submission
        # completes the delivery. Afterwards nothing on the order may move from
        # the rider side: the cash figure, the bottle count and the note are the
        # record of what happened at the door, and letting any of it be
        # rewritten would let the money move silently after the fact. Only the
        # office can correct a submitted delivery.
        #
        # The test is whether the order is FINISHED, not whether a timestamp was
        # ever stamped. Two reasons it is written this way:
        #
        #   `status` is included because the office closing an order must stick.
        #   Cancelling from the admin panel writes `status` alone and never
        #   touches delivery_status or its timestamp, so a rider holding a stale
        #   screen could otherwise resurrect a cancelled order to Delivered and
        #   charge the customer for a delivery the office had called off.
        #
        #   The bare timestamp is NOT enough on its own, because the old flow
        #   stamped it for 'Not Responding' and 'Not Needed' — orders left
        #   MID-FLIGHT to be re-attempted. Locking on the timestamp would strand
        #   every one of those as permanently un-deliverable.
        if (
            instance.status in ('Delivered', 'Cancelled')
            or instance.delivery_status == 'Delivered'
        ):
            return Response(
                {'error': 'This delivery is complete and can no longer be changed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Submitting *is* delivering. The rider app no longer offers a status to
        # choose, so it is derived here rather than trusted from the request —
        # a client sending 'Not Responding' or 'Pending' cannot leave the order
        # half-submitted, and one sending 'Cancelled' cannot kill it.
        allowed_fields = ['delivery_notes', 'number_of_bottles',
                          'cash_received', 'cash_amount']
        data = {k: v for k, v in request.data.items() if k in allowed_fields}
        data['delivery_status'] = 'Delivered'
        if not instance.delivery_completed_at:
            data['delivery_completed_at'] = timezone.now()

        # Online is the customer's word, not money in the account, and the rider
        # cannot see the bank from the doorstep. It goes to the office as a claim
        # instead of the cash fields, which would post straight to the ledger.
        # For the same reason a rider can no longer mark an order paid: the old
        # request field is ignored, and only the office settles an order.
        online_amount = _rider_online_amount(request.data)
        if online_amount:
            data['cash_received'] = False
            data['cash_amount'] = 0

        # `status` and `delivery_status_updated_at` are read-only on
        # OrderSerializer, so DRF silently drops them from validated_data. These
        # are server-derived rather than client input, so they get written
        # straight to the model after the serializer has saved the rest.
        derived = {
            # What the admin panel and the customer's app both read.
            'status': 'Delivered',
            'delivery_status_updated_at': timezone.now(),
        }

        serializer = self.get_serializer(instance, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        if derived:
            for field, value in derived.items():
                setattr(instance, field, value)
            instance.save(update_fields=list(derived))
            # Re-serialize so the response carries the derived values too.
            serializer = self.get_serializer(instance)

        # Post the charge and the rider-collected cash to the customer's ledger.
        # This path used to bypass the balance entirely, so cash a rider took at
        # the door never showed up against the account.
        from ledger.service import claim_online_payment, sync_order
        sync_order(instance, actor=request.user)
        if online_amount:
            claim_online_payment(order=instance, amount=online_amount, actor=request.user)

        # Activity logging for rider delivery actions. One submission per order
        # means one entry, and it is always a completion.
        activity_log(
            request.user, 'rider', 'Delivery Completed',
            target_type='order', target_id=instance.id,
            target_label=f'Order #{instance.id}',
        )

        return Response(serializer.data)

@api_view(['GET'])
@permission_classes([IsDeliveryBoy])
def delivery_boy_stats(request):
    profile = request.user.profile
    total_orders = Order.objects.filter(assigned_delivery_boy=profile).count()
    delivered_orders = Order.objects.filter(
        assigned_delivery_boy=profile, status='Delivered'
    ).count()
    pending_orders = Order.objects.filter(
        assigned_delivery_boy=profile, status__in=['Processing', 'Shipped']
    ).count()
    return Response({
        'total_orders': total_orders,
        'delivered_orders': delivered_orders,
        'pending_orders': pending_orders,
        'delivery_rate': delivered_orders / total_orders * 100 if total_orders > 0 else 0,
        'is_available': profile.is_available,
    })

@api_view(['POST'])
@permission_classes([IsDeliveryBoy])
def update_availability(request):
    profile = request.user.profile
    is_available = request.data.get('is_available')
    if is_available is not None:
        profile.is_available = bool(is_available)
        profile.save()
    return Response({'is_available': profile.is_available, 'message': 'Availability updated successfully'})

class RiderVisitCreateView(APIView):
    """
    POST /api/orders/delivery/visits/ — the NO NEED / NO RESPONSE buttons.

    Journals a doorstep outcome without touching the order status: the
    business may re-attempt the delivery, so the order keeps its normal
    lifecycle and the journal simply records what happened at the gate.
    """
    permission_classes = [IsDeliveryBoy]

    def post(self, request):
        payload = RiderVisitInputSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        try:
            order = Order.objects.select_related('user').get(pk=data['order'])
        except Order.DoesNotExist:
            return Response(
                {'order': 'Unknown order.'}, status=status.HTTP_400_BAD_REQUEST,
            )
        # The rider is request.user, never payload input — and they may only
        # journal against an order that is currently theirs to attempt.
        if order.assigned_delivery_boy_id != request.user.profile.id:
            return Response(
                {'detail': 'This order is not assigned to you.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if order.status in ('Delivered', 'Cancelled'):
            return Response(
                {'detail': f'This order is already {order.status.lower()}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if order.user_id is None:
            return Response(
                {'detail': 'Guest orders have no customer account to journal '
                           'a visit against.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        visit = CustomerVisit.objects.create(
            rider=request.user,
            customer=order.user,
            order=order,
            outcome=data['outcome'],
            note=data['note'],
        )
        activity_log(
            request.user, 'rider', 'Visit Recorded',
            target_type='order', target_id=order.id,
            target_label=f'Order #{order.id}',
            details={'customer': order.user.username, 'outcome': visit.outcome},
        )
        return Response(
            CustomerVisitSerializer(visit).data, status=status.HTTP_201_CREATED,
        )


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def delivery_status_list(request):
    """
    Get list of available delivery statuses for mobile app
    """
    statuses = DeliveryStatus.objects.filter(is_active=True).order_by('order', 'name')
    serializer = DeliveryStatusSerializer(statuses, many=True)
    return Response(serializer.data)


# ─── Staff / admin views ───────────────────────────────────────────────────────

class IsStaff(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


class AdminDeliveryStatusListCreateView(generics.ListCreateAPIView):
    """Staff-managed delivery statuses — includes retired ones.

    Separate from `delivery_status_list` above, which riders read: that one is
    filtered to active statuses and omits the on/off switch entirely.
    """
    permission_classes = [IsStaff]
    serializer_class = AdminDeliveryStatusSerializer
    queryset = DeliveryStatus.objects.all().order_by('order', 'name')
    pagination_class = None


class AdminDeliveryStatusDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsStaff]
    serializer_class = AdminDeliveryStatusSerializer
    queryset = DeliveryStatus.objects.all()

    def destroy(self, request, *args, **kwargs):
        """Refuse to delete a status any order has ever been given.

        Orders store the status by name, so deleting the row would leave those
        deliveries labelled with something nothing can explain. Deactivating
        takes it off the rider's list while keeping the history readable.
        """
        instance = self.get_object()
        in_use = Order.objects.filter(delivery_status=instance.name).count()
        if in_use:
            return Response(
                {'detail': (
                    f'{in_use} order(s) already use "{instance.name}". '
                    'Turn it off instead of deleting it, so their history still reads correctly.'
                )},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class AdminOrderListView(generics.ListCreateAPIView):
    permission_classes = [IsStaff]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return AdminOrderCreateSerializer
        return AdminOrderSerializer

    def get_queryset(self):
        qs = Order.objects.select_related(
            'user', 'user__profile', 'assigned_delivery_boy', 'assigned_delivery_boy__user'
        ).prefetch_related('items__product').order_by('-created_at')

        p = self.request.query_params
        # Default: hide is_hidden orders; pass ?show_hidden=true to include them
        if p.get('show_hidden') != 'true':
            qs = qs.filter(is_hidden=False)
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('search'):
            q = p['search']
            qs = qs.filter(
                Q(user__username__icontains=q) |
                Q(user__email__icontains=q) |
                Q(guest_name__icontains=q) |
                Q(guest_phone__icontains=q) |
                Q(shipping_address__icontains=q)
            )
        qs = scope_to_days(
            qs, 'created_at',
            parse_date(p['date_from']) if p.get('date_from') else None,
            parse_date(p['date_to']) if p.get('date_to') else None,
        )
        if p.get('is_paid') in ('true', 'false'):
            qs = qs.filter(is_paid=(p['is_paid'] == 'true'))
        return qs

    def create(self, request, *args, **kwargs):
        # The auto-applied discount is untouchable without the dedicated
        # permission — is_staff alone is deliberately not enough.
        if request.data.get('discount_override') not in (None, ''):
            if not user_can_override_discount(request.user):
                return Response(
                    {'detail': 'You do not have permission to override the discount.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        serializer = AdminOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.save()

        # Usually a no-op (a new order is not yet Delivered), but an admin can
        # create one already marked delivered.
        from ledger.service import sync_order
        sync_order(order, actor=request.user)

        activity_log(
            request.user, 'order', 'Order Created',
            target_type='order', target_id=order.id,
            target_label=f'Order #{order.id}',
            details={'status': order.status, 'total': str(order.total_price)},
        )
        auto_discount = getattr(order, '_auto_discount_amount', None)
        if auto_discount is not None:
            # Every override is audited: who, what billing computed, what they
            # replaced it with.
            activity_log(
                request.user, 'order', 'Discount Overridden',
                target_type='order', target_id=order.id,
                target_label=f'Order #{order.id}',
                details={
                    'customer': order.user.username if order.user else (order.guest_name or 'Guest'),
                    'auto_discount': str(auto_discount),
                    'override_discount': str(order.discount_amount),
                },
            )
        return Response(
            AdminOrderSerializer(order, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class AdminOrderUpdateView(generics.UpdateAPIView):
    serializer_class = AdminOrderUpdateSerializer
    permission_classes = [IsStaff]
    lookup_field = 'id'
    queryset = Order.objects.all()
    http_method_names = ['patch']

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        data = dict(request.data)

        # Capture values before mutation for activity logging
        old_status = instance.status
        old_rider_id = instance.assigned_delivery_boy_id
        old_hidden = instance.is_hidden

        if 'status' in data:
            new_status = data['status']
            if new_status == 'Shipped' and not instance.delivery_assigned_at:
                instance.delivery_assigned_at = timezone.now()
            elif new_status == 'Delivered' and not instance.delivery_completed_at:
                instance.delivery_completed_at = timezone.now()
            instance.save(update_fields=[
                f for f in ('delivery_assigned_at', 'delivery_completed_at')
                if getattr(instance, f) is not None
            ] or ['updated_at'])

        serializer = self.get_serializer(instance, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        # Activity logging
        label = f'Order #{instance.id}'
        new_status = data.get('status')
        if new_status and new_status != old_status:
            activity_log(
                request.user, 'order', f'Order {new_status}',
                target_type='order', target_id=instance.id, target_label=label,
                details={'from': old_status, 'to': new_status},
            )
        if 'assigned_delivery_boy' in data:
            new_rider_id = data['assigned_delivery_boy']
            if new_rider_id != old_rider_id:
                activity_log(
                    request.user, 'order', 'Rider Assigned',
                    target_type='order', target_id=instance.id, target_label=label,
                    details={'rider_id': new_rider_id},
                )
        if 'is_hidden' in data:
            new_hidden = instance.is_hidden
            if new_hidden != old_hidden:
                activity_log(
                    request.user, 'order',
                    'Order Hidden' if new_hidden else 'Order Unhidden',
                    target_type='order', target_id=instance.id, target_label=label,
                )

        return Response(AdminOrderSerializer(instance, context={'request': request}).data)


class AdminVisitListView(APIView):
    """
    GET /api/orders/admin/visits/ — the visit journal for staff.

    Query params:
        customer  — User id
        rider     — User id
        date_from / date_to — YYYY-MM-DD, on the visit's creation date
        limit     — default 100, max 500
        offset    — default 0
    """
    permission_classes = [IsStaff]

    DEFAULT_LIMIT = 100
    MAX_LIMIT = 500

    def get(self, request):
        qs = (
            CustomerVisit.objects
            .select_related('rider', 'customer', 'order')
            .order_by('-created_at')
        )
        p = request.query_params
        for param, field in (('customer', 'customer_id'), ('rider', 'rider_id')):
            if p.get(param):
                try:
                    qs = qs.filter(**{field: int(p[param])})
                except (TypeError, ValueError):
                    return Response(
                        {param: 'Expected a user id.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
        days = {}
        for param in ('date_from', 'date_to'):
            if p.get(param):
                try:
                    days[param] = datetime.strptime(p[param], '%Y-%m-%d').date()
                except ValueError:
                    return Response(
                        {param: 'Expected YYYY-MM-DD.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
        qs = scope_to_days(
            qs, 'created_at', days.get('date_from'), days.get('date_to'),
        )

        total = qs.count()
        try:
            limit = min(int(p.get('limit', self.DEFAULT_LIMIT)), self.MAX_LIMIT)
        except (TypeError, ValueError):
            limit = self.DEFAULT_LIMIT
        try:
            offset = max(int(p.get('offset', 0)), 0)
        except (TypeError, ValueError):
            offset = 0

        rows = qs[offset:offset + limit]
        return Response({
            'count': total,
            'limit': limit,
            'offset': offset,
            'results': CustomerVisitSerializer(rows, many=True).data,
        })


class AdminOrderSummaryView(APIView):
    """Headline order stats for the admin dashboard.

    `date_from` / `date_to` (YYYY-MM-DD, both inclusive) scope every figure to
    that window. Sending neither leaves the numbers all-time, so the callers
    that predate the dashboard's period filter keep the totals they always
    showed. `today_orders` / `today_revenue` are always literally today,
    whatever range is asked for — they are a fixed reference point, not part of
    the selected period.
    """
    permission_classes = [IsStaff]

    def get(self, request):
        bounds = {}
        for key in ('date_from', 'date_to'):
            raw = (request.query_params.get(key) or '').strip()
            if not raw:
                continue
            parsed = parse_date(raw)
            if parsed is None:
                return Response(
                    {key: 'Expected a date in YYYY-MM-DD format.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            bounds[key] = parsed

        if len(bounds) == 2 and bounds['date_from'] > bounds['date_to']:
            return Response(
                {'date_from': 'Start date cannot be after the end date.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        visible = Order.objects.filter(is_hidden=False)
        qs = scope_to_days(
            visible, 'created_at',
            bounds.get('date_from'), bounds.get('date_to'),
        )

        # localdate(), not now().date(): the project runs in Asia/Karachi, so
        # the UTC date would report yesterday's figures between midnight and 5am.
        today = timezone.localdate()
        today_qs = scope_to_days(visible, 'created_at', today, today)

        return Response({
            'total': qs.count(),
            'pending': qs.filter(status='Pending').count(),
            'processing': qs.filter(status='Processing').count(),
            'shipped': qs.filter(status='Shipped').count(),
            'delivered': qs.filter(status='Delivered').count(),
            'cancelled': qs.filter(status='Cancelled').count(),
            'paid_count': qs.filter(is_paid=True).count(),
            'unpaid_count': qs.filter(is_paid=False).count(),
            # Revenue over the selected window; equals all-time when unscoped.
            'revenue': float(qs.aggregate(rev=Sum('total_price'))['rev'] or 0),
            'today_orders': today_qs.count(),
            'today_revenue': float(today_qs.aggregate(rev=Sum('total_price'))['rev'] or 0),
        })


class DeliveryBoyListView(APIView):
    permission_classes = [IsStaff]

    def get(self, request):
        profiles = UserProfile.objects.filter(
            user_type='delivery_boy'
        ).select_related('user').order_by('user__username')
        data = [
            {
                'id': p.pk,
                'name': p.user.get_full_name() or p.user.username,
                'is_available': p.is_available,
            }
            for p in profiles
        ]
        return Response(data)


@api_view(['GET'])
@permission_classes([IsStaff])
def address_suggestions(request):
    """Return up to 10 distinct addresses from order history matching ?q=."""
    q = (request.query_params.get('q') or '').strip()
    if len(q) < 2:
        return Response([])
    addresses = (
        Order.objects.filter(shipping_address__icontains=q)
        .values_list('shipping_address', flat=True)
        .distinct()
        .order_by('shipping_address')[:10]
    )
    return Response(list(addresses))


@api_view(['GET'])
@permission_classes([IsStaff])
def customer_order_stats(request, user_id):
    """Return order stats for a registered customer."""
    try:
        user = User.objects.select_related('profile').get(pk=user_id)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=404)

    qs = Order.objects.filter(user=user)
    total_orders = qs.count()
    delivered = qs.filter(status='Delivered')
    delivered_count = delivered.count()
    total_bottles = (
        OrderItem.objects.filter(order__user=user, order__status='Delivered')
        .aggregate(total=Sum('quantity'))['total'] or 0
    )
    last_order = qs.order_by('-created_at').values('created_at').first()
    balance = None
    try:
        balance = float(user.profile.account_balance)
    except Exception:
        pass

    return Response({
        'total_orders': total_orders,
        'delivered_count': delivered_count,
        'total_bottles': total_bottles,
        'last_order_date': last_order['created_at'] if last_order else None,
        'account_balance': balance,
    })