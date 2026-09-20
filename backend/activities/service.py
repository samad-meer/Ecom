"""
Central logging service. Import and call log() from any Django view or signal.

Usage:
    from activities.service import log

    log(request.user, 'order', 'Order Created', target_type='order',
        target_id=order.id, target_label=f'Order #{order.id}',
        details={'customer': order.customer_name, 'total': str(order.total_price)})
"""

import logging

from .models import ActivityLog

logger = logging.getLogger(__name__)


def log(
    actor,
    category: str,
    action: str,
    *,
    target_type: str = '',
    target_id: int | None = None,
    target_label: str = '',
    details: dict | None = None,
) -> ActivityLog | None:
    try:
        actor_name = ''
        if actor:
            actor_name = actor.get_full_name() or actor.username
        return ActivityLog.objects.create(
            actor=actor,
            actor_name=actor_name,
            category=category,
            action=action,
            target_type=target_type,
            target_id=target_id,
            target_label=target_label,
            details=details or {},
        )
    except Exception:
        logger.exception('Failed to write activity log')
        return None


def log_data_issue(
    actor,
    action: str,
    *,
    target_type: str = '',
    target_id: int | None = None,
    target_label: str = '',
    details: dict | None = None,
) -> ActivityLog | None:
    """
    Record a record that arrived wrong, so an admin can go and fix it.

    Separate from log() only to keep the category off every call site — these
    are written from validation paths where the request is about to fail, and
    the point is that the failure leaves a trace instead of vanishing into a
    400 that only the person typing ever sees.

    `actor` is None for signup, where nobody is logged in yet; the attempted
    name travels in `details` instead so the row still says who it was.
    """
    return log(
        actor,
        ActivityLog.CATEGORY_DATA,
        action,
        target_type=target_type,
        target_id=target_id,
        target_label=target_label,
        details=details,
    )
