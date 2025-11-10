from allauth.account.views import login_required
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import authentication_classes, permission_classes, api_view
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse, HttpResponse
from rest_framework.parsers import JSONParser
from users.models import User
from repositories.models import Repository
from repositories.serializers import RepositorySerializer


@api_view(["GET", "POST"])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def repository_list(request):
    if request.method == "GET":
        repos = Repository.objects.filter(user=request.user)
        serializer = RepositorySerializer(repos, many=True)
        return JsonResponse(serializer.data, safe=False)
    
    if request.method == "POST":
        data = JSONParser().parse(request)
        serializer = RepositorySerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            return JsonResponse(serializer.data, status=201)
        return JsonResponse(serializer.errors, status=400)
    
def repository_detail(request, pk):
    try:
        repo = Repository.objects.get(pk=pk)
    except Repository.DoesNotExist:
        return HttpResponse(status=404)
    
    if request.method == "GET":
        serializer = RepositorySerializer(repo)
        return JsonResponse(serializer.data)
    
    if request.method == "PUT":
        data = JSONParser().parse(request)
        serializer = RepositorySerializer(repo, data=data)
        if serializer.is_valid():
            serializer.save()
            return JsonResponse(serializer.data)
        return JsonResponse(serializer.errors, status=400)
    if request.method == "DELETE":
        repo.delete()
        return HttpResponse(status=204)
# Create your views here.
# def index(request):
#     return JsonResponse({"Helslo": "world"})
# def getRepos(request):
#     # print(Repository.objects.all())
#     v = Repository.objects.all()
#     val = serializers.serialize("json", Repository.objects.all())
#     return JsonResponse({"data": json.loads(val)})

