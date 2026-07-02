POINTS_WINNER = 10
EXACT_SCORE_BONUS_RATE = 0.5


def compute_outcome(home_score: int, away_score: int) -> str:
    if home_score > away_score:
        return "HOME"
    if home_score < away_score:
        return "AWAY"
    return "DRAW"


def compute_prediction_points(
    predicted_outcome: str,
    predicted_home_score: int | None,
    predicted_away_score: int | None,
    actual_home_score: int,
    actual_away_score: int,
    double_bonus: bool,
) -> int:
    actual_outcome = compute_outcome(actual_home_score, actual_away_score)
    if predicted_outcome != actual_outcome:
        return 0

    points = POINTS_WINNER

    has_exact_guess = predicted_home_score is not None and predicted_away_score is not None
    exact_correct = (
        has_exact_guess
        and predicted_home_score == actual_home_score
        and predicted_away_score == actual_away_score
    )
    if exact_correct:
        points += POINTS_WINNER * EXACT_SCORE_BONUS_RATE

    if double_bonus:
        points *= 2

    return int(points)
