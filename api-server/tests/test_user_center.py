"""Unit tests for app.services.user_center."""

import re

from app.services.user_center import generate_vi_user_id


class TestGenerateViUserId:
    def test_format(self):
        nid = generate_vi_user_id()
        assert nid.startswith("vi-")
        assert len(nid) == 19  # "vi-" + 16 hex chars

    def test_hex_chars_only(self):
        nid = generate_vi_user_id()
        hex_part = nid[3:]
        assert re.match(r"^[0-9a-f]{16}$", hex_part)

    def test_uniqueness(self):
        ids = {generate_vi_user_id() for _ in range(100)}
        assert len(ids) == 100  # all unique
