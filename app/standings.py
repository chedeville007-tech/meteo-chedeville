def summarize_predictions(predictions: list[dict], official_only: bool = False) -> dict:
    """predictions: lignes avec points, predicted_home_score, predicted_away_score,
    match_status, match_home_score, match_away_score, match_external_id.

    official_only=True : ne compte que les matchs importés automatiquement
    (external_id renseigné), pour un classement non manipulable par un admin."""
    total_points = 0
    correct_count = 0
    exact_count = 0
    finished_count = 0

    for p in predictions:
        if p["match_status"] != "FINISHED" or p["points"] is None:
            continue
        if official_only and not p.get("match_external_id"):
            continue

        finished_count += 1
        total_points += p["points"]
        if p["points"] > 0:
            correct_count += 1

        if (
            p["predicted_home_score"] is not None
            and p["predicted_away_score"] is not None
            and p["predicted_home_score"] == p["match_home_score"]
            and p["predicted_away_score"] == p["match_away_score"]
        ):
            exact_count += 1

    return {
        "total_points": total_points,
        "correct_count": correct_count,
        "exact_count": exact_count,
        "finished_count": finished_count,
    }
