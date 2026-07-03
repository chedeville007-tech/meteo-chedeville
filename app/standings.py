def summarize_predictions(predictions: list[dict]) -> dict:
    """predictions: lignes avec points, predicted_home_score, predicted_away_score,
    match_status, match_home_score, match_away_score."""
    total_points = 0
    correct_count = 0
    exact_count = 0
    finished_count = 0

    for p in predictions:
        if p["match_status"] != "FINISHED" or p["points"] is None:
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


def compute_personal_stats(predictions_desc: list[dict]) -> dict:
    """predictions_desc: lignes de pronostics sur des matchs FINISHED, avec points,
    sport_label, triées par date de match décroissante (plus récent en premier)."""
    finished_count = len(predictions_desc)
    correct_count = sum(1 for p in predictions_desc if p["points"] and p["points"] > 0)
    win_rate = round(100 * correct_count / finished_count) if finished_count else 0

    points_by_sport: dict[str, int] = {}
    for p in predictions_desc:
        points_by_sport[p["sport_label"]] = points_by_sport.get(p["sport_label"], 0) + (p["points"] or 0)
    best_sport = max(points_by_sport, key=points_by_sport.get) if points_by_sport else None

    streak = 0
    for p in predictions_desc:
        if p["points"] and p["points"] > 0:
            streak += 1
        else:
            break

    return {
        "finished_count": finished_count,
        "correct_count": correct_count,
        "win_rate": win_rate,
        "best_sport": best_sport,
        "current_streak": streak,
    }
