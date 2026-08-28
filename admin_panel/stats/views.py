"""Public read endpoints for the frontend title screen -- no auth, no PII,
just aggregates keyed by the player's localStorage client_id.
"""

from django.db.models import Sum
from django.http import JsonResponse
from django.views.decorators.http import require_GET

from .models import DeathEvent, PlayerSession

LEADERBOARD_SIZE = 6


@require_GET
def player_stats(request):
    client_id = request.GET.get("client_id", "").strip()

    top = (
        PlayerSession.objects.exclude(client_id__isnull=True)
        .exclude(client_id="")
        .values("client_id")
        .annotate(total_energy=Sum("peak_energy"))
        .order_by("-total_energy")[:LEADERBOARD_SIZE]
    )

    leaderboard = []
    for rank, row in enumerate(top, start=1):
        # A player's display name isn't stable across sessions (no accounts,
        # just a client_id) -- show whatever they were most recently called.
        name = (
            PlayerSession.objects.filter(client_id=row["client_id"])
            .order_by("-connected_at")
            .values_list("name", flat=True)
            .first()
        )
        leaderboard.append(
            {
                "rank": rank,
                "name": name,
                "total_energy": row["total_energy"],
                "is_you": row["client_id"] == client_id,
            }
        )

    if not client_id:
        return JsonResponse({"total_energy": 0, "kd": 0, "leaderboard": leaderboard})

    total_energy = (
        PlayerSession.objects.filter(client_id=client_id).aggregate(total=Sum("peak_energy"))["total"] or 0
    )
    kills = DeathEvent.objects.filter(killer_session__client_id=client_id).count()
    deaths = DeathEvent.objects.filter(victim_session__client_id=client_id).count()
    kd = round(kills / deaths, 1) if deaths else float(kills)

    return JsonResponse({"total_energy": total_energy, "kd": kd, "leaderboard": leaderboard})
