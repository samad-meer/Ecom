from django.urls import path

from . import views

urlpatterns = [
    # Public — powers the customer app's "contact us on WhatsApp" button
    path('business/', views.business_info, name='ledger-business-info'),

    # Receivables — who owes what
    path('customers/', views.receivables, name='ledger-receivables'),
    path('customers/<int:user_id>/statement/', views.statement, name='ledger-statement'),
    path('customers/<int:user_id>/summary/', views.summary, name='ledger-summary'),
    path('customers/<int:user_id>/statement.pdf', views.statement_pdf, name='ledger-statement-pdf'),

    # Writes
    path('payments/', views.RecordPaymentView.as_view(), name='ledger-record-payment'),
    path('entries/', views.ManualEntryView.as_view(), name='ledger-manual-entry'),
    path('entries/<int:pk>/void/', views.VoidEntryView.as_view(), name='ledger-void-entry'),
    path('entries/<int:pk>/receipt/', views.receipt_pdf, name='ledger-receipt-pdf'),

    # Payment accounts — staff manage them here; riders and customers read the
    # active ones from business/ above, which they already call.
    path('admin/payment-accounts/', views.AdminPaymentAccountListCreateView.as_view(),
         name='ledger-payment-accounts'),
    path('admin/payment-accounts/<int:pk>/', views.AdminPaymentAccountDetailView.as_view(),
         name='ledger-payment-account-detail'),
]
