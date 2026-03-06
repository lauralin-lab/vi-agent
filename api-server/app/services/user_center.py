import uuid


def generate_vi_user_id() -> str:
    return f"vi-{uuid.uuid4().hex[:16]}"
