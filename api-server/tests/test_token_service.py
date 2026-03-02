"""Unit tests for app.services.token_service."""

import time

import pytest
from jwt.exceptions import PyJWTError

from app.services.token_service import create_access_token, decode_access_token


class TestCreateAccessToken:
    def test_returns_string(self):
        token = create_access_token({"sub": "user-1"})
        assert isinstance(token, str)
        assert len(token) > 20

    def test_contains_subject(self):
        token = create_access_token({"sub": "user-42"})
        payload = decode_access_token(token)
        assert payload["sub"] == "user-42"

    def test_contains_expiration(self):
        token = create_access_token({"sub": "x"})
        payload = decode_access_token(token)
        assert "exp" in payload
        assert payload["exp"] > time.time()

    def test_preserves_extra_claims(self):
        token = create_access_token({"sub": "u", "role": "admin"})
        payload = decode_access_token(token)
        assert payload["role"] == "admin"

    def test_does_not_mutate_input(self):
        data = {"sub": "u"}
        create_access_token(data)
        assert "exp" not in data  # original dict not modified


class TestDecodeAccessToken:
    def test_valid_token(self):
        token = create_access_token({"sub": "test"})
        payload = decode_access_token(token)
        assert payload["sub"] == "test"

    def test_invalid_token_raises(self):
        with pytest.raises(Exception):
            decode_access_token("not.a.valid.jwt")

    def test_tampered_token_raises(self):
        token = create_access_token({"sub": "test"})
        # Corrupt the signature by replacing multiple characters
        parts = token.split(".")
        sig = parts[2]
        corrupted = sig[:4] + ("XXXX" if sig[4:8] != "XXXX" else "YYYY") + sig[8:]
        tampered = parts[0] + "." + parts[1] + "." + corrupted
        with pytest.raises(Exception):
            decode_access_token(tampered)

    def test_empty_token_raises(self):
        with pytest.raises(Exception):
            decode_access_token("")
