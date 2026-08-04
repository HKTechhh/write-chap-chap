from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsClient(BasePermission):
    message = "Only client accounts can perform this action."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_client)


class IsWriter(BasePermission):
    message = "Only writer accounts can perform this action."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_writer)


class IsAdminRole(BasePermission):
    message = "Administrator access required."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (user.is_staff or user.role == "admin"))


class IsOwnerOrAdmin(BasePermission):
    """Object-level: the object's `user` (or `owner`) must be the requester."""

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_staff or getattr(user, "role", None) == "admin":
            return True
        owner = getattr(obj, "user", None) or getattr(obj, "owner", None)
        return owner == user


class ReadOnly(BasePermission):
    def has_permission(self, request, view):
        return request.method in SAFE_METHODS
