from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='email_verified_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='phone',
            field=models.CharField(blank=True, max_length=32),
        ),
        migrations.AddField(
            model_name='user',
            name='country',
            field=models.CharField(blank=True, help_text='ISO 3166-1 alpha-2, e.g. UG', max_length=2),
        ),
    ]
