import io
import json
import zipfile

from conftest import create_profile, wait_job
from test_api import inspect
from test_features import make_client
from test_report import GOOD, FakeModel, reply


def test_export_pdf_docx_txt_from_stored_records(tmp_path):
    fake = FakeModel(reply(json.dumps(GOOD)))
    with make_client(tmp_path, fake) as client:
        inspection = inspect(client, create_profile(client), (240, 10, 10))
        base = f"/api/v1/inspections/{inspection['id']}"
        client.post(f"{base}/feedback", json={"label": "anomaly", "note": "Bent pin at top left"})
        wait_job(client, client.post(f"{base}/report"))

        txt = client.get(f"{base}/export", params={"format": "txt"})
        assert txt.status_code == 200
        assert txt.headers["content-type"].startswith("text/plain")
        assert "attachment" in txt.headers["content-disposition"]
        text = txt.text
        assert "Worksight inspection report" in text
        assert f"{inspection['anomaly_score']:.4f}" in text
        assert "Fail (anomaly)" in text or "Pass (normal)" in text or "Needs review" in text
        assert "Bent pin at top left" in text
        assert GOOD["summary"] in text
        assert "not a probability" in text

        pdf = client.get(f"{base}/export", params={"format": "pdf"})
        assert pdf.status_code == 200 and pdf.headers["content-type"] == "application/pdf"
        assert pdf.content.startswith(b"%PDF") and len(pdf.content) > 2000

        docx = client.get(f"{base}/export", params={"format": "docx"})
        assert docx.status_code == 200
        with zipfile.ZipFile(io.BytesIO(docx.content)) as archive:
            body = archive.read("word/document.xml").decode()
            media = [n for n in archive.namelist() if n.startswith("word/media/")]
        assert "Bent pin at top left" in body and len(media) == 3


def test_export_without_review_or_description_and_bad_format(client):
    inspection = inspect(client, create_profile(client), (101, 100, 100))
    base = f"/api/v1/inspections/{inspection['id']}"
    text = client.get(f"{base}/export", params={"format": "txt"}).text
    assert "Not reviewed yet." in text
    assert "No AI description was generated" in text
    assert client.get(f"{base}/export", params={"format": "xlsx"}).status_code == 422
    assert client.get("/api/v1/inspections/missing/export").status_code == 404
