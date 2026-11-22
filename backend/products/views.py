from rest_framework import viewsets, permissions
from .models import Product, Category
from .serializers import ProductSerializer, CategorySerializer
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter


class IsStaffOrReadOnly(permissions.BasePermission):
    """Allow anyone to read; only staff can write."""
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


class CategoryViewSet(viewsets.ModelViewSet):
    """Category CRUD. Staff see every category, everyone else only active ones.

    Staff need the full list to manage it — a hidden category has to stay
    reachable to be renamed or switched back on. Pass `?all=true` as staff to
    be explicit; it is the default for staff either way.
    """
    queryset = Category.objects.all().order_by('name')
    serializer_class = CategorySerializer
    permission_classes = [IsStaffOrReadOnly]

    def get_queryset(self):
        qs = Category.objects.all().order_by('name')
        user = self.request.user
        if user and user.is_authenticated and user.is_staff:
            # The product form asks for active-only so a retired category is
            # not offered on new products; the manager screen omits the flag.
            if self.request.query_params.get('active') == 'true':
                return qs.filter(is_active=True)
            return qs
        return qs.filter(is_active=True)


class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [IsStaffOrReadOnly]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ['category', 'is_active', 'is_refill']
    search_fields = ['name', 'description']

    def get_queryset(self):
        # Staff see all products (including inactive); customers see only active.
        # Refills are always ordered on top (-is_refill).
        if self.request.user and self.request.user.is_authenticated and self.request.user.is_staff:
            return Product.objects.select_related('category').order_by('-is_refill', '-created_at')
        return Product.objects.filter(is_active=True).select_related('category').order_by('-is_refill', '-created_at')
