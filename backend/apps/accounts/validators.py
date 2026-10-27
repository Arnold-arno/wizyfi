# apps/accounts/validators.py
# Password policy per the Public Website / Authentication spec §6: a letter, a
# number and a special character; uppercase is optional (NOT enforced). The
# backend is authoritative; the sign-up page mirrors these exact rules.
from django.core.exceptions import ValidationError


class PasswordPolicyValidator:
    def __init__(self, min_length: int = 12, max_length: int = 128):
        self.min_length = min_length
        self.max_length = max_length

    def validate(self, password, user=None):
        problems = []
        if len(password) < self.min_length:
            problems.append(f"at least {self.min_length} characters")
        if len(password) > self.max_length:
            raise ValidationError(f"Use at most {self.max_length} characters.", code="password_too_long")
        if not any(c.isalpha() for c in password):
            problems.append("a letter")
        if not any(c.isdigit() for c in password):
            problems.append("a number")
        if all(c.isalnum() for c in password):
            problems.append("a special character")
        if problems:
            raise ValidationError("Use " + ", ".join(problems) + ".", code="password_policy")

    def get_help_text(self):
        return (
            f"Use at least {self.min_length} characters, including a letter, a number and a special "
            "character. An uppercase letter is recommended but optional."
        )
