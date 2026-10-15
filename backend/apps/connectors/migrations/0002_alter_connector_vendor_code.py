from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('connectors', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='connector',
            name='vendor_code',
            field=models.CharField(choices=[('MIKROTIK', 'Mikrotik'), ('WIZYFI', 'Wizyfi')], max_length=32),
        ),
    ]
