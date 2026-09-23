# apps/accounts/tests.py
import pytest


@pytest.mark.django_db
class TestAuthFlow:
    def test_register_creates_user(self, api_client):
        resp = api_client.post(
            "/api/v1/auth/register/",
            {"email": "new@example.com", "fullName": "New User", "password": "S3curePass!2026"},
            format="json",
        )
        assert resp.status_code == 201
        assert resp.data["email"] == "new@example.com"
        assert "password" not in resp.data

    def test_register_duplicate_email_rejected(self, api_client, user):
        resp = api_client.post(
            "/api/v1/auth/register/",
            {"email": user.email, "fullName": "Dup", "password": "S3curePass!2026"},
            format="json",
        )
        assert resp.status_code == 400

    def test_login_returns_tokens(self, api_client, user):
        resp = api_client.post(
            "/api/v1/auth/login/",
            {"email": user.email, "password": "TestPass123!"},
            format="json",
        )
        assert resp.status_code == 200
        assert "access" in resp.data and "refresh" in resp.data

    def test_login_wrong_password_rejected(self, api_client, user):
        resp = api_client.post(
            "/api/v1/auth/login/",
            {"email": user.email, "password": "wrong"},
            format="json",
        )
        assert resp.status_code == 401

    def test_me_requires_auth(self, api_client):
        resp = api_client.get("/api/v1/auth/me/")
        assert resp.status_code == 401

    def test_me_returns_current_user(self, auth_client, user):
        resp = auth_client.get("/api/v1/auth/me/")
        assert resp.status_code == 200
        assert resp.data["email"] == user.email

    def test_me_is_platform_staff_false_for_regular_user(self, auth_client):
        resp = auth_client.get("/api/v1/auth/me/")
        assert resp.data["is_platform_staff"] is False

    def test_me_is_platform_staff_true_for_platform_staff(self, platform_client):
        resp = platform_client.get("/api/v1/auth/me/")
        assert resp.data["is_platform_staff"] is True

    def test_logout_blacklists_refresh_token(self, api_client, user):
        login = api_client.post(
            "/api/v1/auth/login/",
            {"email": user.email, "password": "TestPass123!"},
            format="json",
        ).data
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access']}")

        logout_resp = api_client.post(
            "/api/v1/auth/logout/", {"refresh": login["refresh"]}, format="json"
        )
        assert logout_resp.status_code == 204

        # The same refresh token must now be rejected, not silently accepted.
        refresh_resp = api_client.post(
            "/api/v1/auth/refresh/", {"refresh": login["refresh"]}, format="json"
        )
        assert refresh_resp.status_code == 401
        assert refresh_resp.data["code"] == "NOT_AUTHENTICATED"
