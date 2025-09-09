import contextvars

# Create a context variable for the current request
_current_request = contextvars.ContextVar("request")


class LocalProxy:
    """A proxy class that retrieves the current request from the context variable."""

    def __init__(self, get_current):
        self._get_current = get_current

    def __getattr__(self, name):
        # Delegate attribute access to the current request
        current_request = self._get_current()
        if current_request is None:
            raise RuntimeError("No request is available.")
        return getattr(current_request, name)

    def __call__(self, *args, **kwargs):
        current_request = self._get_current()
        if current_request is None:
            raise RuntimeError("No request is available.")
        return current_request(*args, **kwargs)


# Create a proxy instance for the current request
request = LocalProxy(lambda: _current_request.get(None))


class GlobalRequestMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request_obj):
        # Set the current request in the context variable
        _current_request.set(request_obj)

        try:
            # Call the next middleware or view
            response = self.get_response(request_obj)
        finally:
            # Clear the context variable after processing the response
            _current_request.set(None)

        return response

    @classmethod
    def get_current_request(cls):
        return _current_request.get(None)  # Return None if no request is set
