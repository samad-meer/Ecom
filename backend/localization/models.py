from django.db import models

USER_TYPE_CHOICES = [
    ('customer', 'Customer'),
    ('delivery_boy', 'Delivery Boy / Rider'),
    ('staff', 'Staff'),
    ('admin', 'Admin'),
]

class LanguageAccessSetting(models.Model):
    """Singleton: whether Urdu is offered at all, and to whom.

    Two switches, because they answer different questions. `urdu_enabled` is
    the master: off means the app is English-only for everybody, however the
    list below is set — useful while translations are still being filled in, or
    to withdraw a half-finished Urdu without losing who was allowed to use it.
    """

    urdu_enabled = models.BooleanField(
        default=True,
        help_text='Off makes the app English-only for everyone, whatever the '
                  'list below says. Turning it back on restores the previous '
                  'per-user-type access.',
    )
    allowed_user_types = models.JSONField(
        default=list,
        help_text='List of user_type values that can toggle language (e.g. ["customer", "delivery_boy"]). Empty = no one.',
    )

    class Meta:
        verbose_name = "Language Access Setting"

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return f"Language access: {self.allowed_user_types}"


class TranslationCategory(models.Model):
    name = models.CharField(max_length=100, unique=True, help_text="Name of the page or section (e.g., 'Home Screen')")
    description = models.TextField(blank=True, null=True)

    class Meta:
        verbose_name_plural = "Translation Categories"
        ordering = ['name']

    def __str__(self):
        return self.name

class Translation(models.Model):
    category = models.ForeignKey(TranslationCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name='translations', help_text="The page or section this translation belongs to")
    slug = models.SlugField(unique=True, help_text="Unique key for the translation (e.g., 'home_welcome_message')")
    text_en = models.TextField(verbose_name="English Text")
    text_ur = models.TextField(verbose_name="Urdu Text", blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['category', 'slug']

    def __str__(self):
        return f"{self.slug} ({self.category})" if self.category else self.slug
