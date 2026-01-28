# tests/test_cors.py
def test_cors_preflight_allows_localhost_3000(client_and_db):
    client, _ = client_and_db

    r = client.options(
        "/api/session/start",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == "http://localhost:3000"
