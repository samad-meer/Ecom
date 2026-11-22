from django.db import migrations, models


def mark_existing_refills(apps, schema_editor):
    Product = apps.get_model('products', 'Product')
    Product.objects.filter(name__icontains='refill').update(is_refill=True)


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0004_category_is_active'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='is_refill',
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text='Designates this product as a refill; displayed prominently on top with distinct animated styling.',
            ),
        ),
        migrations.RunPython(mark_existing_refills, migrations.RunPython.noop),
    ]
