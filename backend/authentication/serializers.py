from rest_framework import serializers
from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token

class UserSerializer(serializers.ModelSerializer):

    def __init__(self, *args, **kwargs):
        exclude_fields = kwargs.pop('exclude_fields', None)
        super(UserSerializer, self).__init__(*args, **kwargs)
        if self.context and 'view' in self.context and self.context['view'].__class__.__name__ == 'UsersView':
            exclude_fields = ['subscription', 'avatar', 'file']
        if exclude_fields:
            for field_name in exclude_fields:
                self.fields.pop(field_name)

    class Meta:
        fields = ('id', 'email')
        model = get_user_model()

class TokenSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = Token
        fields = ('key', 'user')
