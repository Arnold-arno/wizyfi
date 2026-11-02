# apps/accounts/models.py
#
# Custom UUID-based staff User model — deliberately separate from
# apps.customers.Customer (Wi-Fi end-users).
# CHANGED (Round 20): email_verified_at, phone, country.

from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.auth.models import PermissionsMixin
from django.db import models

from apps.common.models import BaseModel

from .managers import UserManager


class User(AbstractBaseUser, PermissionsMixin, BaseModel):
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)  # Django admin access only
    last_login_at = models.DateTimeField(null=True, blank=True)

    # Set once, when the person proves they control the address. Changing the
    # email must clear it (and the verification token embeds the address, so an
    # old link can never verify a new address).
    email_verified_at = models.DateTimeField(null=True, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    country = models.CharField(max_length=2, blank=True, help_text="ISO 3166-1 alpha-2, e.g. UG")

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        db_table = "accounts_user"
        indexes = [models.Index(fields=["email"])]

    def __str__(self):
        return self.email
