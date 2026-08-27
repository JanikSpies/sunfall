from django.contrib import admin

from .models import ConcurrentPlayersSample, DeathEvent, PlayerSession


class ReadOnlyAdmin(admin.ModelAdmin):
    """This data is written exclusively by the Go backend's analytics writer --
    editing it here would just be lying to yourself later. Deletion (e.g. to
    honor a data request) is still allowed."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(PlayerSession)
class PlayerSessionAdmin(ReadOnlyAdmin):
    list_display = ("name", "client_id", "connected_at", "disconnected_at", "duration_display", "peak_energy")
    list_filter = ("connected_at",)
    search_fields = ("name", "client_id")
    date_hierarchy = "connected_at"

    @admin.display(description="Duration")
    def duration_display(self, obj):
        seconds = obj.duration_seconds
        if seconds is None:
            return "(still connected)"
        minutes, secs = divmod(int(seconds), 60)
        return f"{minutes}m {secs}s"


@admin.register(DeathEvent)
class DeathEventAdmin(ReadOnlyAdmin):
    list_display = ("victim_name", "reason", "killer_name", "energy_transferred", "occurred_at")
    list_filter = ("reason",)
    search_fields = ("victim_name", "killer_name")
    date_hierarchy = "occurred_at"


@admin.register(ConcurrentPlayersSample)
class ConcurrentPlayersSampleAdmin(ReadOnlyAdmin):
    list_display = ("count", "sampled_at")
    date_hierarchy = "sampled_at"
