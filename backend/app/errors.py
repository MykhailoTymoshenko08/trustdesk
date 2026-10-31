"""contract error format: {"error": {"code", "message"}}"""
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class ApiError(HTTPException):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(status_code=status, detail={"code": code, "message": message})


def _body(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message}}


def install(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def _http(_: Request, exc: HTTPException):
        d = exc.detail
        code, msg = (d["code"], d["message"]) if isinstance(d, dict) else ("http_error", str(d))
        return JSONResponse(_body(code, msg), status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def _val(_: Request, exc: RequestValidationError):
        return JSONResponse(_body("validation_error", str(exc.errors()[:3])), status_code=422)
