from django.db.models.signals import pre_save
from django.dispatch import receiver
from .models import Order
from core.notifications import send_push_notification


from django.db.models.signals import pre_save
from django.dispatch import receiver
from django.db.models import Q
from .models import Order
from core.notifications import send_push_notification


def _format_address(instance):
    raw = instance.compose_address() or instance.shipping_address or ""
    clean = raw.replace('\n', ', ').strip()
    return (clean[:47] + '...') if len(clean) > 50 else clean


def _format_balance(user):
    if not user or not hasattr(user, 'profile'):
        return ""
    bal = getattr(user.profile, 'account_balance', None)
    if bal is None:
        return ""
    try:
        b_val = float(bal)
        if b_val > 0:
            return f"Balance Due: PKR {int(b_val):,}"
        elif b_val < 0:
            return f"Credit: PKR {int(abs(b_val)):,}"
        return "Balance: Settled"
    except (ValueError, TypeError):
        return f"Balance: PKR {bal}"


@receiver(pre_save, sender=Order)
def order_change_notifications(sender, instance, **kwargs):
    if not instance.pk:
        return  # handled in post_save for new orders

    try:
        old = Order.objects.get(pk=instance.pk)
    except Order.DoesNotExist:
        return

    # Notify when status changes
    if old.status != instance.status:
        addr = _format_address(instance)
        cust_token = None

        if instance.status == 'Delivered':
            customer_label = (
                instance.user.get_full_name() or instance.user.username
                if instance.user_id
                else instance.guest_name or "Guest"
            )
            balance_str = _format_balance(instance.user)

            if instance.is_paid:
                pay_str = "Paid Online"
            elif instance.cash_received and instance.cash_amount:
                pay_str = f"Cash: PKR {int(instance.cash_amount):,}"
            else:
                pay_str = f"Bill: PKR {int(instance.total_price):,}"

            rider_str = ""
            if instance.assigned_delivery_boy and hasattr(instance.assigned_delivery_boy, 'user'):
                r_user = instance.assigned_delivery_boy.user
                r_name = r_user.get_full_name() or r_user.username
                rider_str = f" · Rider: {r_name}"

            # 1. Notify Customer (with address, bill and current balance)
            if instance.user_id:
                user = instance.user
                if hasattr(user, 'profile') and user.profile.expo_push_token:
                    cust_token = user.profile.expo_push_token
                    cust_parts = []
                    if addr:
                        cust_parts.append(f"Delivered to {addr}")
                    cust_parts.append(f"Total: PKR {int(instance.total_price):,}")
                    if balance_str:
                        cust_parts.append(balance_str)

                    send_push_notification(
                        cust_token,
                        f"Order #{instance.id} Delivered 🎉",
                        " · ".join(cust_parts),
                        {"orderId": instance.id, "status": "Delivered"},
                    )

            # 2. Notify Admins (helpful delivery alert with address, payment & balance)
            from accounts.models import UserProfile
            admin_parts = [customer_label]
            if addr:
                admin_parts.append(addr)
            admin_parts.append(pay_str)
            if balance_str:
                admin_parts.append(balance_str)
            admin_body = " · ".join(admin_parts) + rider_str

            admin_tokens = list(
                UserProfile.objects.filter(
                    Q(user__is_staff=True) | Q(user__is_superuser=True) | Q(user_type__in=['admin', 'staff'])
                ).exclude(expo_push_token__isnull=True).exclude(expo_push_token='')
                .values_list('expo_push_token', flat=True)
                .distinct()
            )
            for a_token in admin_tokens:
                if a_token == cust_token:
                    continue
                send_push_notification(
                    a_token,
                    f"Order #{instance.id} Delivered ✅",
                    admin_body,
                    {"orderId": instance.id, "status": "Delivered", "type": "admin_order_delivered"},
                )

        elif instance.user_id:
            # Other statuses for Customer (Shipped, Cancelled, Processing)
            user = instance.user
            if hasattr(user, 'profile') and user.profile.expo_push_token:
                if instance.status == 'Shipped':
                    title = f"Order #{instance.id} Dispatched 🚚"
                    body = f"Your order is on the way to {addr}." if addr else "Your order is on the way."
                elif instance.status == 'Cancelled':
                    title = f"Order #{instance.id} Cancelled ❌"
                    body = f"Order #{instance.id} has been cancelled."
                else:
                    title = f"Order #{instance.id} Update"
                    body = f"Your order status is now: {instance.status}."

                send_push_notification(
                    user.profile.expo_push_token,
                    title,
                    body,
                    {"orderId": instance.id, "status": instance.status},
                )

    # Notify rider when they are newly assigned to an order
    old_rider_id = old.assigned_delivery_boy_id
    new_rider_id = instance.assigned_delivery_boy_id
    if new_rider_id and new_rider_id != old_rider_id:
        rider_profile = instance.assigned_delivery_boy
        if rider_profile and rider_profile.expo_push_token:
            customer_label = (
                instance.user.get_full_name() or instance.user.username
                if instance.user_id
                else instance.guest_name or "Guest"
            )
            send_push_notification(
                rider_profile.expo_push_token,
                "New Delivery Assigned",
                f"Order #{instance.id} for {customer_label} has been assigned to you.",
                {"orderId": instance.id, "type": "assignment"},
            )
