"""End-to-end checks on the HTTP surface, using the real PDFs."""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_parse_both_files_into_one_semester(client, course_schedule_path, english_schedule_path):
    with open(course_schedule_path, "rb") as main, open(english_schedule_path, "rb") as english:
        response = client.post(
            "/api/parse",
            files=[
                ("files", ("course-schedule.pdf", main, "application/pdf")),
                ("files", ("english-schedule.pdf", english, "application/pdf")),
            ],
        )
    assert response.status_code == 200
    body = response.json()
    assert body["warnings"] == []
    assert len(body["courses"]) == 73
    assert body["title"] == "89 Spring 2026"


def test_parse_rejects_a_non_pdf(client):
    response = client.post(
        "/api/parse",
        files=[("files", ("notes.txt", b"just some text", "text/plain"))],
    )
    assert response.status_code == 400


def test_parse_reports_an_unrecognised_pdf(client):
    minimal_pdf = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>"
    response = client.post(
        "/api/parse",
        files=[("files", ("mystery.pdf", minimal_pdf, "application/pdf"))],
    )
    assert response.status_code == 422
