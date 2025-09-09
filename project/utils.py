from django import forms
from django.contrib import messages
from django.http import Http404, HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect


def is_xhr(request: HttpRequest):
    return (
        request.headers.get("x-requested-with") == "XMLHttpRequest"
        or request.headers.get("accept") == "application/json"
        or is_curl(request)
    )


def is_curl(request: HttpRequest):
    user_agent = request.headers.get("user-agent", "").lower()
    return "curl" in user_agent


def terminal_border_message(message: str):
    border = "+" + "-" * (len(message) + 2) + "+"
    return f"{border}\n| {message} |\n{border}"
