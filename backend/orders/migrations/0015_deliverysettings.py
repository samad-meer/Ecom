# Generated for DeliverySettings

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0014_messagetemplate'),
    ]

    operations = [
        migrations.CreateModel(
            name='DeliverySettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('rider_can_call', models.BooleanField(default=True, help_text='Allow riders to call customers directly from the delivery screen.')),
                ('rider_can_whatsapp', models.BooleanField(default=True, help_text='Allow riders to open WhatsApp to message customers from the delivery screen.')),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Delivery Settings',
                'verbose_name_plural': 'Delivery Settings',
            },
        ),
    ]
