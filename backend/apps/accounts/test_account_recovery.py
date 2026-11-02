# apps/accounts/test_account_recovery.py  (Round 20 — NOT yet run: no repo on disk when written)
import pytest
from django.core import mail
from django.core.cache import cache
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.tokens import make_reset_parts, make_verification_token

NEW_PW = "A-brand-new-passphrase-42"


@pytest.fixture(autouse=True)
def _clear_throttle_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.mark.django_db
class TestEmailVerification:
    def test_register_sends_a_verification_email(self, api_client):
        resp = api_client.post(
            "/api/v1/auth/register/",
            {"email": "new@example.com", "fullName": "New", "password": "S3curePass!2026"}, format="json",
        )
        assert resp.status_code == 201
        assert len(mail.outbox) == 1 and "/verify-email?token=" in mail.outbox[0].body

    def test_valid_token_verifies_once_and_again_is_harmless(self, api_client, user):
        token = make_verification_token(user)
        for _ in range(2):
            assert api_client.post("/api/v1/auth/verify-email/", {"token": token}, format="json").status_code == 200
        user.refresh_from_db()
        assert user.email_verified_at is not None

    def test_garbage_token_rejected(self, api_client):
        resp = api_client.post("/api/v1/auth/verify-email/", {"token": "nope"}, format="json")
        assert resp.status_code == 400 and "token" in resp.data["fieldErrors"]

    def test_token_dies_when_the_email_changes(self, api_client, user):
        token = make_verification_token(user)
        User.objects.filter(pk=user.pk).update(email="changed@example.com")
        assert api_client.post("/api/v1/auth/verify-email/", {"token": token}, format="json").status_code == 400

    def test_expired_token_rejected(self, api_client, user, settings, monkeypatch):
        from apps.accounts import tokens

        token = make_verification_token(user)
        monkeypatch.setattr(tokens, "VERIFY_MAX_AGE_SECONDS", -1)
        assert api_client.post("/api/v1/auth/verify-email/", {"token": token}, format="json").status_code == 400

    def test_resend_requires_login_and_is_noop_when_verified(self, api_client, auth_client, user):
        assert api_client.post("/api/v1/auth/resend-verification/").status_code == 401
        assert auth_client.post("/api/v1/auth/resend-verification/").json()["sent"] is True
        user.email_verified_at = timezone.now()
        user.save()
        assert auth_client.post("/api/v1/auth/resend-verification/").json()["sent"] is False

    def test_me_reports_verification(self, auth_client, user):
        assert auth_client.get("/api/v1/auth/me/").json()["emailVerified"] is False


@pytest.mark.django_db
class TestPasswordReset:
    def test_known_and_unknown_emails_get_the_same_answer(self, api_client, user):
        a = api_client.post("/api/v1/auth/password-reset/", {"email": user.email}, format="json")
        b = api_client.post("/api/v1/auth/password-reset/", {"email": "nobody@example.com"}, format="json")
        assert a.status_code == b.status_code == 200 and a.json() == b.json()
        assert len(mail.outbox) == 1  # only the real account was mailed

    def test_full_reset_flow_is_single_use_and_revokes_sessions(self, api_client, user):
        login = api_client.post("/api/v1/auth/login/", {"email": user.email, "password": "TestPass123!"}, format="json").data
        uid, token = make_reset_parts(user)
        ok = api_client.post("/api/v1/auth/password-reset/confirm/", {"uid": uid, "token": token, "password": NEW_PW}, format="json")
        assert ok.status_code == 200
        user.refresh_from_db()
        assert user.check_password(NEW_PW)
        # the same link cannot be used twice
        again = api_client.post("/api/v1/auth/password-reset/confirm/", {"uid": uid, "token": token, "password": NEW_PW + "x"}, format="json")
        assert again.status_code == 400
        # the old refresh token is dead
        assert api_client.post("/api/v1/auth/refresh/", {"refresh": login["refresh"]}, format="json").status_code == 401

    def test_weak_password_rejected_and_link_still_usable(self, api_client, user):
        uid, token = make_reset_parts(user)
        weak = api_client.post("/api/v1/auth/password-reset/confirm/", {"uid": uid, "token": token, "password": "short"}, format="json")
        assert weak.status_code == 400 and "password" in weak.data["fieldErrors"]
        good = api_client.post("/api/v1/auth/password-reset/confirm/", {"uid": uid, "token": token, "password": NEW_PW}, format="json")
        assert good.status_code == 200

    def test_bad_link_rejected(self, api_client):
        resp = api_client.post("/api/v1/auth/password-reset/confirm/", {"uid": "xx", "token": "yy", "password": NEW_PW}, format="json")
        assert resp.status_code == 400

    def test_request_is_rate_limited(self, api_client):
        codes = [api_client.post("/api/v1/auth/password-reset/", {"email": "a@example.com"}, format="json").status_code for _ in range(7)]
        assert codes[-1] == 429


@pytest.mark.django_db
class TestProfileAndPassword:
    def test_update_profile(self, auth_client):
        resp = auth_client.patch("/api/v1/auth/me/", {"fullName": "New Name", "phone": "+256700000000", "country": "ug"}, format="json")
        assert resp.status_code == 200 and resp.json()["country"] == "UG" and resp.json()["fullName"] == "New Name"

    def test_cannot_change_email_or_staff_flags_through_profile(self, auth_client, user):
        auth_client.patch("/api/v1/auth/me/", {"email": "evil@example.com", "isStaff": True}, format="json")
        user.refresh_from_db()
        assert user.email == "owner@example.com" and user.is_staff is False

    def test_bad_country_rejected(self, auth_client):
        assert auth_client.patch("/api/v1/auth/me/", {"country": "UGA"}, format="json").status_code == 400

    def test_change_password_needs_current_password(self, auth_client, user):
        bad = auth_client.post("/api/v1/auth/change-password/", {"currentPassword": "wrong", "newPassword": NEW_PW}, format="json")
        assert bad.status_code == 400 and "current_password" in bad.data["fieldErrors"] or "currentPassword" in bad.data["fieldErrors"]
        ok = auth_client.post("/api/v1/auth/change-password/", {"currentPassword": "TestPass123!", "newPassword": NEW_PW}, format="json")
        assert ok.status_code == 200
        user.refresh_from_db()
        assert user.check_password(NEW_PW)
