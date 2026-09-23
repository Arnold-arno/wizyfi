# apps/accounts/models.py
#
# Custom UUID-based staff User model — deliberately separate from
# apps.customers.Customer (Wi-Fi end-users), per Expectations_and_workflow:
# "customers (Wi-Fi end-users, fully separate from staff Users)".

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

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        db_table = "accounts_user"
        indexes = [models.Index(fields=["email"])]

    def __str__(self):
        return self.email
