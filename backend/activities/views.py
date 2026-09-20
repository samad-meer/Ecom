from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import BasePermission
from django.contrib.auth.models import User
from django.db.models import Count
from django.utils.dateparse import parse_date

from core.timeframes import scope_to_days
from .models import ActivityLog
from .serializers import ActivityLogSerializer


class IsStaff(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


class ActivityLogListView(APIView):
    """
    GET /api/activities/
    Query params:
        category    — order | rider | customer | user
        action      — partial match (icontains)
        actor_id    — filter by actor user id
        target_type — order | staff | customer
        target_id   — filter by target object id
        date_from   — YYYY-MM-DD
        date_to     — YYYY-MM-DD
        limit       — default 100, max 500
        offset      — default 0
    """
    permission_classes = [IsStaff]

    def get(self, request):
        qs = ActivityLog.objects.all()
        p = request.query_params

        if p.get('action'):
            qs = qs.filter(action__icontains=p['action'])
        if p.get('actor_id'):
            qs = qs.filter(actor_id=p['actor_id'])
        if p.get('target_type'):
            qs = qs.filter(target_type=p['target_type'])
        if p.get('target_id'):
            qs = qs.filter(target_id=p['target_id'])
        qs = scope_to_days(
            qs, 'timestamp',
            parse_date(p['date_from']) if p.get('date_from') else None,
            parse_date(p['date_to']) if p.get('date_to') else None,
        )

        # Tab badges are counted BEFORE the category filter, so switching tab
        # does not collapse every other tab's badge to nothing. Every other
        # filter still applies — the badge answers "how many in this tab match
        # what I am currently looking at", which is the only useful question.
        counts = {
            row['category']: row['n']
            for row in qs.values('category').annotate(n=Count('id'))
        }

        if p.get('category'):
            qs = qs.filter(category=p['category'])

        try:
            limit = min(int(p.get('limit', 100)), 500)
            offset = int(p.get('offset', 0))
        except (ValueError, TypeError):
            limit, offset = 100, 0

        total = qs.count()
        data = ActivityLogSerializer(qs[offset:offset + limit], many=True).data
        return Response({
            'count': total,
            'counts': counts,
            'total_all': sum(counts.values()),
            'results': data,
        })
