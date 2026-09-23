# apps/connectors/tests.py
import pytest

from apps.connectors.models import Connector


@pytest.mark.django_db
class TestConnectorCredentials:
    def test_credentials_absent_from_create_response(self, auth_client, place, org_headers):
        resp = auth_client.post(
            "/api/v1/connectors/",
            {
                "place": str(place.id), "vendorCode": "MIKROTIK", "name": "Main",
                "credentials": {"username": "admin", "password": "hunter2"},
            },
            format="json", **org_headers,
        )
        assert resp.status_code == 201
        assert "credentials" not in resp.data
        assert "password" not in str(resp.data)

    def test_credentials_encrypted_at_rest(self, connector):
        raw = bytes(connector.encrypted_credentials)
        assert b"hunter2" not in raw

    def test_credentials_round_trip(self, connector):
        assert connector.get_credentials() == {"username": "admin", "password": "hunter2"}

    def test_tampered_ciphertext_fails_closed(self, connector):
        """If the stored ciphertext is corrupted, decryption must raise
        rather than silently returning garbage or an empty dict."""
        connector.encrypted_credentials = b"not-valid-fernet-data"
        connector.save()
        with pytest.raises(ValueError):
            connector.get_credentials()


@pytest.mark.django_db
class TestRouterHealthCheck:
    def test_health_check_transitions_provisioning_to_online(self, auth_client, router, org_headers):
        assert router.status == "PROVISIONING"
        resp = auth_client.get(f"/api/v1/routers/{router.id}/health/", **org_headers)
        assert resp.status_code == 200
        assert resp.data["healthy"] is True
        router.refresh_from_db()
        assert router.status == "ONLINE"
        assert router.last_seen_at is not None

    def test_health_check_reports_unhealthy_with_missing_credentials(
        self, auth_client, place, org_headers
    ):
        from apps.connectors.models import Router

        bad_connector = Connector(place=place, vendor_code="MIKROTIK", name="No Creds")
        bad_connector.set_credentials({})  # missing username/password
        bad_connector.save()
        r = Router.objects.create(place=place, connector=bad_connector, name="Bad Router", identity="x")

        resp = auth_client.get(f"/api/v1/routers/{r.id}/health/", **org_headers)
        assert resp.status_code == 200
        assert resp.data["healthy"] is False

    def test_disconnect_action_idempotent_stub(self, auth_client, router, org_headers):
        resp = auth_client.post(
            f"/api/v1/routers/{router.id}/disconnect/",
            {"session_identifier": "abc-123"}, format="json", **org_headers,
        )
        assert resp.status_code == 200
        assert resp.data["success"] is True

    def test_disconnect_without_session_identifier_fails_cleanly(self, auth_client, router, org_headers):
        resp = auth_client.post(
            f"/api/v1/routers/{router.id}/disconnect/", {}, format="json", **org_headers
        )
        assert resp.status_code == 200  # adapter-level failure, not an HTTP error
        assert resp.data["success"] is False


@pytest.mark.django_db
class TestConnectorTenantIsolation:
    def test_second_org_sees_zero_connectors(self, auth_client, connector, other_org_headers):
        resp = auth_client.get("/api/v1/connectors/", **other_org_headers)
        assert resp.status_code == 403  # no membership in that org at all
