from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import ClientProfile, Notification, Role, User, WriterProfile


class UserSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "display_name",
            "role",
            "phone",
            "country",
            "avatar",
            "is_verified",
            "kyc_status",
            "date_joined",
        ]
        read_only_fields = ["id", "role", "is_verified", "kyc_status", "date_joined"]


class WriterProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    can_withdraw = serializers.BooleanField(read_only=True)

    class Meta:
        model = WriterProfile
        fields = [
            "id",
            "user",
            "headline",
            "bio",
            "skills",
            "subjects",
            "languages",
            "years_experience",
            "tier",
            "rating_avg",
            "rating_count",
            "completed_orders",
            "on_time_rate",
            "revision_rate",
            "dispute_count",
            "strikes",
            "is_suspended",
            "total_earned",
            "can_withdraw",
        ]
        read_only_fields = [
            "tier",
            "rating_avg",
            "rating_count",
            "completed_orders",
            "on_time_rate",
            "revision_rate",
            "dispute_count",
            "strikes",
            "is_suspended",
            "total_earned",
        ]


class PublicWriterSerializer(serializers.ModelSerializer):
    """What a client sees when browsing writers — no strike/earnings internals."""

    id = serializers.IntegerField(source="user.id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    display_name = serializers.CharField(source="user.display_name", read_only=True)
    avatar = serializers.ImageField(source="user.avatar", read_only=True)
    country = serializers.CharField(source="user.country", read_only=True)
    is_verified = serializers.BooleanField(source="user.is_verified", read_only=True)

    class Meta:
        model = WriterProfile
        fields = [
            "id",
            "username",
            "display_name",
            "avatar",
            "country",
            "is_verified",
            "headline",
            "bio",
            "skills",
            "subjects",
            "languages",
            "years_experience",
            "tier",
            "rating_avg",
            "rating_count",
            "completed_orders",
            "on_time_rate",
        ]


class ClientProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = ClientProfile
        fields = [
            "id",
            "user",
            "company_name",
            "industry",
            "orders_posted_count",
            "orders_completed_count",
            "total_spent",
            "rating_avg",
            "rating_count",
        ]
        read_only_fields = [
            "orders_posted_count",
            "orders_completed_count",
            "total_spent",
            "rating_avg",
            "rating_count",
        ]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True)
    role = serializers.ChoiceField(choices=[Role.CLIENT, Role.WRITER])

    class Meta:
        model = User
        fields = [
            "username",
            "email",
            "password",
            "password_confirm",
            "role",
            "first_name",
            "last_name",
            "phone",
            "country",
        ]

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value.lower()

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("password_confirm"):
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class MeSerializer(serializers.ModelSerializer):
    """The full identity payload the frontend bootstraps from."""

    writer_profile = WriterProfileSerializer(read_only=True)
    client_profile = ClientProfileSerializer(read_only=True)
    wallet_balance = serializers.SerializerMethodField()
    unread_notifications = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "display_name",
            "role",
            "phone",
            "country",
            "avatar",
            "is_verified",
            "is_staff",
            "kyc_status",
            "date_joined",
            "writer_profile",
            "client_profile",
            "wallet_balance",
            "unread_notifications",
        ]

    def get_wallet_balance(self, obj):
        wallet = getattr(obj, "wallet", None)
        return str(wallet.balance) if wallet else "0.00"

    def get_unread_notifications(self, obj):
        return obj.notifications.filter(is_read=False).count()


class RoleTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Embed role in the JWT and return the user object alongside the tokens."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["username"] = user.username
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = MeSerializer(self.user).data
        return data


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, validators=[validate_password])

    def validate_old_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "kind", "title", "body", "link", "is_read", "created_at"]
        read_only_fields = fields


class KycSubmitSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["kyc_document", "phone"]

    def update(self, instance, validated_data):
        instance = super().update(instance, validated_data)
        instance.kyc_status = "pending"
        instance.save(update_fields=["kyc_status"])
        return instance
