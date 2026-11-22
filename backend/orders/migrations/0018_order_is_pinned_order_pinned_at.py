# Generated for Order is_pinned and pinned_at

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0017_deliverysettings_delivery_confirmation_note'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='is_pinned',
            field=models.BooleanField(
                default=False,
                help_text='Whether this order is pinned / prioritized by admin to be delivered first by the rider',
            ),
        ),
        migrations.AddField(
            model_name='order',
            name='pinned_at',
            field=models.DateTimeField(
                blank=True,
                null=True,
                help_text='Timestamp when the order was pinned by admin',
            ),
        ),
    ]
