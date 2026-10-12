import uuid

from fastapi.testclient import TestClient

from backend.main import app, connect, init_db

client = TestClient(app)


def setup_function():
    init_db()
    with connect() as db:
        db.execute("DELETE FROM messages")
        db.execute("DELETE FROM swaps")
        db.execute("DELETE FROM user_skills")
        db.execute("DELETE FROM users")
        db.commit()


def participant(name: str, teach: list[str], learn: list[str]) -> str:
    user_id = "test-" + uuid.uuid4().hex
    response = client.post("/api/users", json={"id": user_id, "name": name})
    assert response.status_code == 200
    response = client.put(f"/api/users/{user_id}/skills", json={"teach": teach, "learn": learn})
    assert response.status_code == 200
    return user_id


def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_matching_is_case_insensitive_and_one_way():
    learner = participant("Learner", ["Excel"], ["pYtHoN"])
    teacher = participant("Teacher", ["Python", "Guitar"], ["Cooking"])
    response = client.get(f"/api/users/{learner}/matches")
    assert response.status_code == 200
    matches = response.json()
    assert len(matches) == 1
    assert matches[0]["id"] == teacher
    assert matches[0]["matching_skills"] == ["Python"]


def test_request_accept_and_persistent_chat():
    learner = participant("Learner", [], ["Python"])
    teacher = participant("Teacher", ["Python"], [])
    response = client.post("/api/swaps", json={
        "requester_id": learner, "recipient_id": teacher, "skill": "Python"
    })
    assert response.status_code == 200
    swap_id = response.json()["id"]

    blocked = client.post(f"/api/swaps/{swap_id}/messages", json={
        "user_id": learner, "body": "Hello"
    })
    assert blocked.status_code == 403

    accepted = client.post(f"/api/swaps/{swap_id}/respond", json={
        "user_id": teacher, "response": "accepted"
    })
    assert accepted.status_code == 200

    sent = client.post(f"/api/swaps/{swap_id}/messages", json={
        "user_id": learner, "body": "Hello there"
    })
    assert sent.status_code == 200
    messages = client.get(f"/api/swaps/{swap_id}/messages", params={"user_id": teacher})
    assert messages.status_code == 200
    assert messages.json()[0]["body"] == "Hello there"


def test_non_participant_cannot_read_chat():
    learner = participant("Learner", [], ["Python"])
    teacher = participant("Teacher", ["Python"], [])
    stranger = participant("Stranger", [], [])
    swap_id = client.post("/api/swaps", json={
        "requester_id": learner, "recipient_id": teacher, "skill": "Python"
    }).json()["id"]
    client.post(f"/api/swaps/{swap_id}/respond", json={"user_id": teacher, "response": "accepted"})
    response = client.get(f"/api/swaps/{swap_id}/messages", params={"user_id": stranger})
    assert response.status_code == 403


def test_duplicate_swap_is_rejected():
    learner = participant("Learner", [], ["Python"])
    teacher = participant("Teacher", ["Python"], [])
    payload = {"requester_id": learner, "recipient_id": teacher, "skill": "Python"}
    assert client.post("/api/swaps", json=payload).status_code == 200
    assert client.post("/api/swaps", json=payload).status_code == 409
