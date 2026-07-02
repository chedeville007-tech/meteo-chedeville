import random

ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # sans 0/O/1/I/L pour éviter les confusions


def generate_invite_code(length: int = 6) -> str:
    return "".join(random.choice(ALPHABET) for _ in range(length))
