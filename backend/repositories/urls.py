from django.urls import path

from repositories import views

urlpatterns = [
    # path("", views.index, name="index")
    # path("", views.getRepos, name="index"),
    path("repositories/", views.repository_list),
    path("repositories/<int:pk>/", views.repository_detail)
]