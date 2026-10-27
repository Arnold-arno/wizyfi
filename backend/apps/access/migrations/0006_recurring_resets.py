import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('access', '0005_plan_validity_mode_session_reset_binding'),
        ('places', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='RecurringReset',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('scope_type', models.CharField(choices=[('ROUTER', 'Single router'), ('ROUTERS', 'Selected routers'), ('PLACE', 'Whole place')], max_length=10)),
                ('router_ids', models.JSONField(blank=True, default=list)),
                ('time_of_day', models.TimeField()),
                ('weekdays', models.JSONField(blank=True, default=list)),
                ('timezone', models.CharField(max_length=64)),
                ('is_active', models.BooleanField(default=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('place', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='recurring_resets', to='places.place')),
            ],
            options={
                'db_table': 'access_recurringreset',
            },
        ),
        migrations.CreateModel(
            name='RecurringResetOccurrence',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('scheduled_at', models.DateTimeField()),
                ('event', models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name='recurrence_occurrence', to='access.hardlogoutevent')),
                ('recurring_reset', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='occurrences', to='access.recurringreset')),
            ],
            options={
                'db_table': 'access_recurringresetoccurrence',
            },
        ),
        migrations.AddIndex(
            model_name='recurringreset',
            index=models.Index(fields=['place', 'is_active'], name='access_recur_place_active_idx'),
        ),
        migrations.AddConstraint(
            model_name='recurringresetoccurrence',
            constraint=models.UniqueConstraint(fields=('recurring_reset', 'scheduled_at'), name='unique_occurrence_per_rule'),
        ),
    ]
