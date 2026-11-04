# MOVED (Round 22): this file was delivered as backend/apps/accounts/0002_...py, OUTSIDE the
# migrations/ package, so Django never saw it. The columns it adds (email_verified_at, phone,
# country) were therefore missing from the database while the User model and /auth/me/ already
# used them, which breaks login-adjacent endpoints. Delete the misplaced copy.
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
