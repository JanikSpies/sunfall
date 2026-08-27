import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="PlayerSession",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "player_id",
                    models.PositiveIntegerField(
                        help_text="In-game player ID for this connection. Stable across a reconnect, "
                        "so a brief network drop doesn't split one session into two rows."
                    ),
                ),
                ("name", models.CharField(max_length=32)),
                (
                    "client_id",
                    models.CharField(
                        blank=True,
                        db_index=True,
                        help_text="Persistent per-browser ID (localStorage) used to spot returning players.",
                        max_length=64,
                        null=True,
                    ),
                ),
                ("connected_at", models.DateTimeField(db_index=True)),
                ("disconnected_at", models.DateTimeField(blank=True, null=True)),
                (
                    "peak_energy",
                    models.FloatField(
                        default=0,
                        help_text="High-water mark for this session -- the closest thing this game has to a score.",
                    ),
                ),
            ],
            options={
                "db_table": "stats_playersession",
                "ordering": ["-connected_at"],
            },
        ),
        migrations.CreateModel(
            name="DeathEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("victim_name", models.CharField(max_length=32)),
                (
                    "reason",
                    models.CharField(
                        choices=[
                            ("sun", "Sun"),
                            ("black_hole", "Black hole (match end)"),
                            ("energy_depletion", "Energy depletion"),
                        ],
                        max_length=32,
                    ),
                ),
                ("killer_name", models.CharField(blank=True, max_length=32, null=True)),
                ("energy_transferred", models.FloatField(default=0)),
                ("occurred_at", models.DateTimeField(db_index=True)),
                (
                    "victim_session",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="deaths",
                        to="stats.playersession",
                    ),
                ),
                (
                    "killer_session",
                    models.ForeignKey(
                        blank=True,
                        help_text="Set only for a credited kill (dashed into the sun within the credit window).",
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="kills",
                        to="stats.playersession",
                    ),
                ),
            ],
            options={
                "db_table": "stats_deathevent",
                "ordering": ["-occurred_at"],
            },
        ),
        migrations.CreateModel(
            name="ConcurrentPlayersSample",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("count", models.PositiveIntegerField()),
                ("sampled_at", models.DateTimeField(db_index=True)),
            ],
            options={
                "db_table": "stats_concurrentplayersample",
                "ordering": ["-sampled_at"],
            },
        ),
        migrations.AddIndex(
            model_name="playersession",
            index=models.Index(fields=["client_id", "connected_at"], name="stats_playe_client__358365_idx"),
        ),
    ]
