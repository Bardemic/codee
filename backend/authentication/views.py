from dj_rest_auth.views import LoginView
from rest_framework.response import Response
from .serializers import UserSerializer


class CustomLoginView(LoginView):
    def get_response(self):
        user = getattr(self, 'user',)
        token = getattr(self, 'token',)
        data = {
            "key": getattr(token, "key",),
            "user": UserSerializer(user, context=self.get_serializer_context()).data,
        }
        return Response(data)
