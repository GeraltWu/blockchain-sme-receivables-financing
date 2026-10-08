from flask import jsonify


def api_error(code: str, message: str, status: int, details: dict | None = None):
    return (
        jsonify({"error": {"code": code, "message": message, "details": details or {}}}),
        status,
    )
