from django.http import HttpRequest


def is_xhr(request: HttpRequest):
    return (
        request.headers.get("x-requested-with") == "XMLHttpRequest"
        or request.headers.get("accept") == "application/json"
        or is_curl(request)
    )


def is_curl(request: HttpRequest):
    user_agent = request.headers.get("user-agent", "").lower()
    return "curl" in user_agent
