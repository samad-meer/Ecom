from datetime import datetime

from django.contrib.auth.models import User
from django.db.models import Max, Q, Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import UserProfile
from activities.service import log as activity_log

from . import service
from .models import LedgerEntry, PaymentAccount, PaymentClaim
from .permissions import CanRecordPayment, CanViewLedger, CanVoidLedger
from .serializers import (
    BusinessSettingsSerializer,
    ClaimNotFoundSerializer,
    ConfirmClaimSerializer,
    LedgerEntrySerializer,
    ManualEntrySerializer,
    PaymentClaimSerializer,
    ReceivableSerializer,
    RecordPaymentSerializer,
    VoidEntrySerializer,
    PaymentAccountSerializer, PaymentAccountWriteSerializer,
)
from .statement import build_statement, customer_summary

DEFAULT_LIMIT = 100
MAX_LIMIT = 500


def _parse_date(raw):
    if not raw:
        return None
    try:
        return datetime.strptime(raw, '%Y-%m-%d').date()
    except ValueError:
        return None


def _paginate(request, rows):
    """`{count, results}` with limit/offset — matches the activities app."""
    try:
        limit = min(int(request.query_params.get('limit', DEFAULT_LIMIT)), MAX_LIMIT)
    except (TypeError, ValueError):
        limit = DEFAULT_LIMIT
    try:
        offset = max(int(request.query_params.get('offset', 0)), 0)
    except (TypeError, ValueError):
        offset = 0
    return rows[offset:offset + limit], limit, offset


def _attach_pdf(response, filename):
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    # Without this the browser can't read the filename cross-origin, which is
    # what the web client's apiDownload helper relies on.
    response['Access-Control-Expose-Headers'] = 'Content-Disposition'
    return response


# ─── Public business contact ─────────────────────────────────────────────────

@api_view(['GET', 'PATCH'])
@permission_classes([AllowAny])
def business_info(request):
    """
    Business name, phone and address for the customer-facing "contact us"
    button. Public on purpose — it is the same information printed on every
    receipt — and served from the database so the number can be changed from
    the admin panel without shipping a new app build.

    PATCH edits the admin-configurable slice. The permission is checked in the
    body rather than via permission_classes because GET on this same URL must
    keep working for signed-out customers.
    """
    from .models import LedgerSettings

    cfg = LedgerSettings.load()

    if request.method == 'PATCH':
        if not (request.user and request.user.is_authenticated and request.user.is_staff):
            return Response(
                {'detail': 'Administrators only.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = BusinessSettingsSerializer(cfg, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        cfg = serializer.save()
        activity_log(
            request.user, 'settings', 'Business Settings Updated',
            target_type='settings', target_id=cfg.pk, target_label='Business',
        )

    payload = {
        'name': cfg.business_name,
        'phone': cfg.business_phone,
        'address': cfg.business_address,
        'share_location_label': cfg.share_location_label,
    }
    # Contact details are public (the storefront's "contact us" button needs
    # them signed-out). The bank account is not: it is given out freely to
    # customers, but there is no reason to leave it on an anonymous endpoint for
    # anything on the internet to scrape. Any signed-in user may see it — riders
    # quote it at the door, customers pay into it.
    if request.user and request.user.is_authenticated:
        payload.update(_payment_details_payload(cfg, request))
    return Response(payload)


def _payment_details_payload(cfg, request):
    """The account a customer can transfer to, as the rider app renders it.

    `has_details` saves every caller from re-deriving "is this configured at
    all" — the rider page shows a set-up-required message rather than a card of
    blank rows when the office has not filled these in.
    """
    accounts = list(
        PaymentAccount.objects.filter(is_active=True).order_by('sort_order', 'id')
    )
    serialized = PaymentAccountSerializer(
        accounts, many=True, context={'request': request},
    ).data

    # The flat payment_* keys are the OLD single-account shape. Rider builds
    # already installed read them and know nothing about `payment_accounts`, so
    # the first active account is mirrored back into them. Dropping these keys
    # would blank the Pay tab on every phone that has not been updated — and
    # this project ships by hand, so that is most of them for a while.
    primary = accounts[0] if accounts else None
    if primary is not None:
        first = serialized[0]
        legacy = {
            'payment_account_title': primary.account_title,
            'payment_account_number': primary.account_number or primary.iban,
            'payment_bank_name': primary.bank_name,
            'payment_qr': first['qr'],
            'payment_instructions': primary.instructions,
        }
    else:
        qr = cfg.payment_qr
        legacy = {
            'payment_account_title': cfg.payment_account_title,
            'payment_account_number': cfg.payment_account_number,
            'payment_bank_name': cfg.payment_bank_name,
            # Absolute so the mobile app can load it without knowing the API host.
            'payment_qr': request.build_absolute_uri(qr.url) if qr else None,
            'payment_instructions': cfg.payment_instructions,
        }

    return {
        **legacy,
        'payment_accounts': serialized,
        'has_payment_details': bool(
            serialized
            or legacy['payment_account_number']
            or legacy['payment_account_title']
            or legacy['payment_qr']
        ),
    }


# ─── Receivables ─────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([CanViewLedger])
def receivables(request):
    """Every customer with a ledger presence, most-owing first."""
    search = (request.query_params.get('search') or '').strip()
    only_owing = (request.query_params.get('only_owing') or '').lower() in ('1', 'true', 'yes')

    totals = {
        row['customer_id']: row
        for row in LedgerEntry.objects.values('customer_id').annotate(
            amount=Sum('amount'), out=Sum('bottles_out'), inn=Sum('bottles_in'),
        )
    }

    profiles = (
        UserProfile.objects.filter(user_type='customer')
        .select_related('user')
    )
    if search:
        profiles = profiles.filter(
            Q(user__username__icontains=search)
            | Q(user__first_name__icontains=search)
            | Q(user__last_name__icontains=search)
            | Q(phone_number__icontains=search)
            | Q(address__icontains=search)
            | Q(customer_code__icontains=search)
        )

    # Last-activity dates for everyone in two queries rather than two per row.
    last_entry_dates = {
        row['customer_id']: row['last']
        for row in LedgerEntry.objects.values('customer_id').annotate(last=Max('entry_date'))
    }
    last_payment_dates = {
        row['customer_id']: row['last']
        for row in LedgerEntry.objects
        .filter(entry_type__in=LedgerEntry.PAYMENT_TYPES)
        .values('customer_id').annotate(last=Max('entry_date'))
    }

    rows = []
    for profile in profiles:
        agg = totals.get(profile.user_id)
        balance = -(agg['amount'] if agg else 0)
        if only_owing and balance <= 0:
            continue
        rows.append({
            'id': profile.user_id,
            'username': profile.user.username,
            'name': profile.user.get_full_name() or profile.user.username,
            'customer_code': profile.customer_code,
            'phone': profile.phone_number,
            'address': profile.address,
            'balance': balance,
            'bottles_held': int((agg['out'] or 0) - (agg['inn'] or 0)) if agg else 0,
            'last_entry_date': last_entry_dates.get(profile.user_id),
            'last_payment_date': last_payment_dates.get(profile.user_id),
        })

    rows.sort(key=lambda r: r['balance'], reverse=True)
    page, limit, offset = _paginate(request, rows)
    return Response({
        'count': len(rows),
        'limit': limit,
        'offset': offset,
        'results': ReceivableSerializer(page, many=True).data,
    })


# ─── Statement ───────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([CanViewLedger])
def statement(request, user_id):
    customer = get_object_or_404(User, pk=user_id)
    data = build_statement(
        customer,
        start=_parse_date(request.query_params.get('start')),
        end=_parse_date(request.query_params.get('end')),
        entry_type=request.query_params.get('entry_type') or None,
        source=request.query_params.get('source') or None,
    )
    page, limit, offset = _paginate(request, data['rows'])
    profile = UserProfile.objects.filter(user=customer).first()

    return Response({
        'customer': {
            'id': customer.pk,
            'name': customer.get_full_name() or customer.username,
            'username': customer.username,
            'customer_code': getattr(profile, 'customer_code', None),
            'phone': getattr(profile, 'phone_number', None),
            'address': getattr(profile, 'address', None),
        },
        'period': data['period'],
        'opening_balance': data['opening_balance'],
        'closing_balance': data['closing_balance'],
        'opening_stock': data['opening_stock'],
        'closing_stock': data['closing_stock'],
        'totals': data['totals'],
        'count': data['count'],
        'limit': limit,
        'offset': offset,
        'results': LedgerEntrySerializer(page, many=True).data,
    })


@api_view(['GET'])
@permission_classes([CanViewLedger])
def summary(request, user_id):
    customer = get_object_or_404(User, pk=user_id)
    return Response(customer_summary(customer))


# ─── Writes ──────────────────────────────────────────────────────────────────

class RecordPaymentView(APIView):
    permission_classes = [CanRecordPayment]

    def post(self, request):
        payload = RecordPaymentSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        customer = get_object_or_404(User, pk=data['customer_id'])
        service.ensure_customer_code(customer)
        try:
            entry = service.record_payment(
                customer=customer,
                amount=data['amount'],
                payment_method=data['payment_method'],
                entry_date=data.get('entry_date'),
                reference=data.get('reference', ''),
                notes=data.get('notes', ''),
                actor=request.user,
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        activity_log(
            request.user, 'customer', 'Payment Recorded',
            target_type='ledger_entry', target_id=entry.pk,
            target_label=entry.receipt_number,
            details={'customer': customer.username, 'amount': str(entry.amount)},
        )
        return Response(LedgerEntrySerializer(entry).data, status=status.HTTP_201_CREATED)


class ManualEntryView(APIView):
    permission_classes = [CanRecordPayment]

    def post(self, request):
        payload = ManualEntrySerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        customer = get_object_or_404(User, pk=data['customer_id'])
        service.ensure_customer_code(customer)
        try:
            entry = service.post_manual(
                customer=customer,
                entry_type=data['entry_type'],
                amount=data['amount'],
                description=data['description'],
                entry_date=data.get('entry_date'),
                notes=data.get('notes', ''),
                bottles_out=data.get('bottles_out', 0),
                bottles_in=data.get('bottles_in', 0),
                actor=request.user,
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        activity_log(
            request.user, 'customer', 'Ledger Entry Posted',
            target_type='ledger_entry', target_id=entry.pk,
            target_label=entry.get_entry_type_display(),
            details={'customer': customer.username, 'amount': str(entry.amount)},
        )
        return Response(LedgerEntrySerializer(entry).data, status=status.HTTP_201_CREATED)


class VoidEntryView(APIView):
    permission_classes = [CanVoidLedger]

    def post(self, request, pk):
        entry = get_object_or_404(LedgerEntry, pk=pk)
        payload = VoidEntrySerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        try:
            reversal = service.void_entry(
                entry, reason=payload.validated_data['reason'], actor=request.user,
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        activity_log(
            request.user, 'customer', 'Ledger Entry Voided',
            target_type='ledger_entry', target_id=entry.pk,
            target_label=entry.receipt_number or str(entry.pk),
            details={'reason': payload.validated_data['reason']},
        )
        return Response(LedgerEntrySerializer(reversal).data, status=status.HTTP_201_CREATED)


# ─── Online payment claims ───────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([CanViewLedger])
def payment_claims(request):
    """
    The office's online payments list, oldest first so nothing sits forgotten.
    Defaults to what still needs checking; `?status=` opens the closed ones.
    """
    claim_status = request.query_params.get('status') or PaymentClaim.WAITING
    claims = (
        PaymentClaim.objects.filter(status=claim_status)
        .select_related('customer', 'customer__profile', 'order', 'claimed_by', 'resolved_by', 'entry')
        .order_by('created_at', 'id')
    )

    search = (request.query_params.get('search') or '').strip()
    if search:
        claims = claims.filter(
            Q(customer__username__icontains=search)
            | Q(customer__first_name__icontains=search)
            | Q(customer__last_name__icontains=search)
            | Q(customer__profile__phone_number__icontains=search)
            | Q(customer__profile__customer_code__icontains=search)
            | Q(order__guest_name__icontains=search)
            | Q(order__guest_phone__icontains=search)
        )

    page, limit, offset = _paginate(request, claims)
    return Response({
        'count': claims.count(),
        'total_amount': claims.aggregate(total=Sum('amount'))['total'] or 0,
        'limit': limit,
        'offset': offset,
        'results': PaymentClaimSerializer(page, many=True).data,
    })


class ConfirmClaimView(APIView):
    """The money is in the bank: post the payment and close the claim."""

    permission_classes = [CanRecordPayment]

    def post(self, request, pk):
        claim = get_object_or_404(PaymentClaim, pk=pk)
        payload = ConfirmClaimSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        if claim.customer_id:
            service.ensure_customer_code(claim.customer)
        try:
            claim = service.confirm_claim(
                claim,
                reference=data['reference'],
                entry_date=data.get('entry_date'),
                actor=request.user,
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        activity_log(
            request.user, 'customer', 'Online Payment Confirmed',
            target_type='payment_claim', target_id=claim.pk,
            target_label=claim.entry.receipt_number if claim.entry else f'Claim #{claim.pk}',
            details={'amount': str(claim.amount), 'reference': claim.reference},
        )
        return Response(PaymentClaimSerializer(claim).data)


class ClaimNotFoundView(APIView):
    """The bank does not show it. Nothing moves, and it can still be confirmed."""

    permission_classes = [CanRecordPayment]

    def post(self, request, pk):
        claim = get_object_or_404(PaymentClaim, pk=pk)
        payload = ClaimNotFoundSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        try:
            claim = service.mark_claim_not_found(
                claim, note=payload.validated_data['note'], actor=request.user,
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        activity_log(
            request.user, 'customer', 'Online Payment Not Found',
            target_type='payment_claim', target_id=claim.pk,
            target_label=f'Claim #{claim.pk}',
            details={'amount': str(claim.amount), 'note': claim.note},
        )
        return Response(PaymentClaimSerializer(claim).data)


# ─── Documents ───────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([CanViewLedger])
def receipt_pdf(request, pk):
    from .pdf import render_receipt

    entry = get_object_or_404(LedgerEntry, pk=pk)
    if entry.entry_type not in LedgerEntry.PAYMENT_TYPES:
        return Response(
            {'detail': 'Receipts are only available for payment entries.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    pdf = render_receipt(entry)
    name = entry.receipt_number or f'entry-{entry.pk}'
    return _attach_pdf(
        HttpResponse(pdf, content_type='application/pdf'), f'receipt-{name}.pdf',
    )


@api_view(['GET'])
@permission_classes([CanViewLedger])
def statement_pdf(request, user_id):
    from .pdf import render_statement

    customer = get_object_or_404(User, pk=user_id)
    service.ensure_customer_code(customer)
    data = build_statement(
        customer,
        start=_parse_date(request.query_params.get('start')),
        end=_parse_date(request.query_params.get('end')),
        entry_type=request.query_params.get('entry_type') or None,
        source=request.query_params.get('source') or None,
    )
    pdf = render_statement(data)
    period = data['period']
    suffix = f"{period['start'] or 'all'}_to_{period['end'] or 'date'}"
    return _attach_pdf(
        HttpResponse(pdf, content_type='application/pdf'),
        f'statement-{customer.username}-{suffix}.pdf',
    )


# ─── Payment accounts ────────────────────────────────────────────────────────

class AdminPaymentAccountListCreateView(APIView):
    """
    GET  /api/ledger/admin/payment-accounts/   every account, active or not
    POST /api/ledger/admin/payment-accounts/   add one (multipart for the QR)

    Staff only. Riders and customers read the active ones through
    /api/ledger/business/, which is where they already look.
    """

    permission_classes = [CanViewLedger]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        qs = PaymentAccount.objects.all().order_by('sort_order', 'id')
        return Response(
            PaymentAccountSerializer(qs, many=True, context={'request': request}).data
        )

    def post(self, request):
        serializer = PaymentAccountWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        account = serializer.save()
        activity_log(
            request.user, 'settings', 'Payment Account Added',
            target_type='payment_account', target_id=account.id,
            target_label=str(account),
            details={'bank': account.bank_name},
        )
        return Response(
            PaymentAccountSerializer(account, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class AdminPaymentAccountDetailView(APIView):
    """PATCH to edit, DELETE to remove. Staff only."""

    permission_classes = [CanViewLedger]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def patch(self, request, pk):
        account = get_object_or_404(PaymentAccount, pk=pk)
        serializer = PaymentAccountWriteSerializer(
            account, data=request.data, partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        activity_log(
            request.user, 'settings', 'Payment Account Updated',
            target_type='payment_account', target_id=account.id,
            target_label=str(account),
        )
        return Response(
            PaymentAccountSerializer(account, context={'request': request}).data
        )

    def delete(self, request, pk):
        account = get_object_or_404(PaymentAccount, pk=pk)
        label = str(account)
        account.delete()
        activity_log(
            request.user, 'settings', 'Payment Account Deleted',
            target_type='payment_account', target_id=pk, target_label=label,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
