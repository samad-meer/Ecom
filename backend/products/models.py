from django.db import models

class Category(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True, blank=True)
    icon = models.CharField(max_length=50, blank=True, help_text="Icon name from Expo Vector Icons")
    # Retiring a category must not orphan the products already filed under it,
    # so it is hidden rather than deleted: it disappears from the storefront and
    # from the product form's picker, while existing products keep the label.
    is_active = models.BooleanField(
        default=True,
        help_text="Uncheck to hide from the storefront and the product form. "
                  "Products already in this category keep it.",
    )

    class Meta:
        verbose_name_plural = "Categories"

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            from django.utils.text import slugify
            base = slugify(self.name) or "category"
            slug = base
            n = 2
            # Guarantee a unique slug even if two names slugify to the same value.
            while Category.objects.exclude(pk=self.pk).filter(slug=slug).exists():
                slug = f"{base}-{n}"
                n += 1
            self.slug = slug
        super().save(*args, **kwargs)

class Product(models.Model):
    category = models.ForeignKey(Category, related_name='products', on_delete=models.SET_NULL, null=True, blank=True)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    is_active = models.BooleanField(default=True)
    is_refill = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Designates this product as a refill; displayed prominently on top with distinct animated styling.",
    )
    image = models.ImageField(upload_to='products/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class ProductImage(models.Model):
    """Gallery image for a product (up to 3 per product, enforced in the API)."""
    product = models.ForeignKey(Product, related_name='images', on_delete=models.CASCADE)
    image = models.ImageField(upload_to='products/')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f"Image for {self.product.name}"
