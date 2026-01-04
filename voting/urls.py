from django.urls import path

from . import views

urlpatterns = [
    path("", views.HomepageView.as_view(), name="home"),
    path("data/ballots/<uuid:vote_uuid>/<path:token>", views.ballot_view, name="ballot"),
    path("data/ballots/<uuid:vote_uuid>/", views.BallotListView.as_view(), name="ballot_list"),
    path('vote/<uuid:vote_uuid>/hash', views.vote_hash, name='vote_hash'),
    path('vote/<uuid:vote_uuid>/results', views.vote_results, name='vote_results'),
    path('vote/<uuid:vote_uuid>/public-key', views.get_public_key, name='get_public_key'),
    path('vote/<uuid:vote_uuid>/sign', views.sign_blind_token, name='sign_blind_token'),
    path('vote/<uuid:vote_uuid>/submit', views.submit_vote, name='submit_vote'),
    path("submit-vote/<uuid:vote_uuid>", views.submit_vote_view, name="submit"),
    path("submit-vote/", views.VotesListView.as_view(), name="submit_list"),
    path("help", views.voting_help, name="help"),
]
