"""
These tables are written exclusively by the Go game server's async analytics
writer (backend/analytics/writer.go), never by Django -- this app only reads
and displays. Table and column names are pinned via db_table/db_column so the
two sides can't silently drift apart from each other.
"""

from django.db import models


class DeathReason(models.TextChoices):
    SUN = "sun", "Sun"
    BLACK_HOLE = "black_hole", "Black hole (match end)"
    ENERGY_DEPLETION = "energy_depletion", "Energy depletion"


class PlayerSession(models.Model):
    player_id = models.PositiveIntegerField(
        help_text="In-game player ID for this connection. Stable across a reconnect, "
        "so a brief network drop doesn't split one session into two rows.",
    )
    name = models.CharField(max_length=32)
    client_id = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        db_index=True,
        help_text="Persistent per-browser ID (localStorage) used to spot returning players.",
    )
    connected_at = models.DateTimeField(db_index=True)
    disconnected_at = models.DateTimeField(null=True, blank=True)
    peak_energy = models.FloatField(default=0, help_text="High-water mark for this session -- the closest thing this game has to a score.")

    class Meta:
        db_table = "stats_playersession"
        ordering = ["-connected_at"]
        indexes = [models.Index(fields=["client_id", "connected_at"])]

    def __str__(self) -> str:
        return f"{self.name} ({self.connected_at:%Y-%m-%d %H:%M})"

    @property
    def duration_seconds(self) -> float | None:
        if not self.disconnected_at:
            return None
        return (self.disconnected_at - self.connected_at).total_seconds()


class DeathEvent(models.Model):
    victim_session = models.ForeignKey(PlayerSession, on_delete=models.CASCADE, related_name="deaths")
    victim_name = models.CharField(max_length=32)
    reason = models.CharField(max_length=32, choices=DeathReason.choices)
    killer_session = models.ForeignKey(
        PlayerSession,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="kills",
        help_text="Set only for a credited kill (dashed into the sun within the credit window).",
    )
    killer_name = models.CharField(max_length=32, null=True, blank=True)
    energy_transferred = models.FloatField(default=0)
    occurred_at = models.DateTimeField(db_index=True)

    class Meta:
        db_table = "stats_deathevent"
        ordering = ["-occurred_at"]

    def __str__(self) -> str:
        return f"{self.victim_name} died ({self.reason}) at {self.occurred_at:%Y-%m-%d %H:%M}"


class ConcurrentPlayersSample(models.Model):
    count = models.PositiveIntegerField()
    sampled_at = models.DateTimeField(db_index=True)

    class Meta:
        db_table = "stats_concurrentplayersample"
        ordering = ["-sampled_at"]

    def __str__(self) -> str:
        return f"{self.count} players at {self.sampled_at:%Y-%m-%d %H:%M}"
