from fastapi import Request
from fastapi.responses import JSONResponse
class AppError(Exception):
    def __init__(self, code, message, details=None, status_code=400): self.code=code; self.message=message; self.details=details or {}; self.status_code=status_code
def error_response(exc): return JSONResponse(status_code=exc.status_code, content={'error': {'code': exc.code, 'message': exc.message, 'details': exc.details}})
async def app_error_handler(request: Request, exc: AppError): return error_response(exc)
