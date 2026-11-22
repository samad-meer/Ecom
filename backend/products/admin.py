from django.contrib import admin
from .models import Product, Category

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'icon')
    prepopulated_fields = {'slug': ('name',)}

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'price', 'is_refill', 'is_active', 'created_at')
    list_editable = ('price', 'is_refill', 'is_active')
    list_filter = ('is_refill', 'category', 'is_active', 'created_at')
    search_fields = ('name', 'description')
