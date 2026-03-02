"""Unit tests for app.services.user_center."""

import re

from app.services.user_center import generate_vi_user_id, hash_password, verify_password


class TestHashPassword:
    def test_returns_hash_string(self):
        h = hash_password("password123")
        assert isinstance(h, str)
        assert h != "password123"

    def test_different_hashes_for_same_password(self):
        h1 = hash_password("same")
        h2 = hash_password("same")
        assert h1 != h2  # bcrypt uses random salt

    def test_hash_starts_with_bcrypt_prefix(self):
        h = hash_password("test")
        assert h.startswith("$2")  # bcrypt hash prefix


class TestVerifyPassword:
    def test_correct_password(self):
        h = hash_password("my_secret")
        assert verify_password("my_secret", h) is True

    def test_wrong_password(self):
        h = hash_password("my_secret")
        assert verify_password("wrong_secret", h) is False

    def test_empty_password_against_hash(self):
        h = hash_password("real_pass")
        assert verify_password("", h) is False

    def test_unicode_password(self):
        h = hash_password("密码测试🔐")
        assert verify_password("密码测试🔐", h) is True
        assert verify_password("密码测试", h) is False


class TestGenerateNanoclawId:
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
