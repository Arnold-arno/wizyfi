# apps/accounts/test_password_policy.py
import pytest
from django.core.exceptions import ValidationError

from apps.accounts.validators import PasswordPolicyValidator


@pytest.mark.django_db
class TestRegisterPasswordPolicy:
    @pytest.mark.parametrize(
        "pw", ["short1!", "NoNumbersHere!!!!", "123456789012!!", "NoSpecialChars12345"]
    )
    def test_weak_passwords_rejected_with_field_error(self, api_client, pw):
        resp = api_client.post(
            "/api/v1/auth/register/", {"email": "weak@example.com", "fullName": "W", "password": pw}, format="json"
        )
        assert resp.status_code == 400
        assert "password" in resp.data["fieldErrors"]

    def test_uppercase_is_optional(self, api_client):
        resp = api_client.post(
            "/api/v1/auth/register/",
            {"email": "lower@example.com", "fullName": "L", "password": "lowercase-only-pass1"},
            format="json",
        )
        assert resp.status_code == 201


class TestValidatorUnit:
    def test_too_long_rejected(self):
        with pytest.raises(ValidationError):
            PasswordPolicyValidator().validate("a1!" * 60)

    def test_help_text_mentions_optional_uppercase(self):
        assert "optional" in PasswordPolicyValidator().get_help_text()
