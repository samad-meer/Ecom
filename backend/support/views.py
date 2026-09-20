from django.utils import timezone
from rest_framework import generics, permissions, serializers
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth.models import User
from django.shortcuts import get_object_or_404
from core.image_limits import validate_image_list
from .models import Complaint, ComplaintImage
from .serializers import ComplaintSerializer, AdminComplaintSerializer


class ComplaintListCreateView(generics.ListCreateAPIView):
    serializer_class = ComplaintSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Complaint.objects.filter(user=self.request.user).order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class AdminComplaintListCreateView(APIView):
    """Staff: list all complaints (GET) or create one on behalf of a customer (POST)."""
    permission_classes = [permissions.IsAuthenticated]

    def _check_staff(self, request):
        if not request.user.is_staff:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

    def get(self, request):
        err = self._check_staff(request)
        if err:
            return err
        qs = Complaint.objects.select_related('user').order_by('-created_at')
        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return Response(AdminComplaintSerializer(qs, many=True, context={'request': request}).data)

    def post(self, request):
        err = self._check_staff(request)
        if err:
            return err
        user_id = request.data.get('user_id')
        subject = (request.data.get('subject') or '').strip()
        description = (request.data.get('description') or '').strip()

        if not user_id:
            return Response({'user_id': 'Customer is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not subject:
            return Response({'subject': 'Subject is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not description:
            return Response({'description': 'Description is required.'}, status=status.HTTP_400_BAD_REQUEST)

        images = request.FILES.getlist('uploaded_images')
        try:
            validate_image_list(images)
        except serializers.ValidationError as e:
            return Response({'uploaded_images': e.detail}, status=status.HTTP_400_BAD_REQUEST)

        customer = get_object_or_404(User, pk=user_id)
        complaint = Complaint.objects.create(
            user=customer,
            subject=subject,
            description=description,
        )
        for f in images:
            ComplaintImage.objects.create(complaint=complaint, image=f)
        return Response(
            AdminComplaintSerializer(complaint, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class AdminComplaintDetailView(APIView):
    """Staff: reply/status update (PATCH), edit (PUT), or delete (DELETE) a complaint."""
    permission_classes = [permissions.IsAuthenticated]

    def _get(self, pk):
        return get_object_or_404(Complaint.objects.select_related('user'), pk=pk)

    def _check_staff(self, request):
        if not request.user.is_staff:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

    def patch(self, request, pk):
        err = self._check_staff(request)
        if err:
            return err
        complaint = self._get(pk)
        reply = (request.data.get('admin_reply') or '').strip()
        new_status = request.data.get('status')

        if reply:
            complaint.admin_reply = reply
            complaint.admin_reply_at = timezone.now()

        if new_status and new_status in dict(Complaint.STATUS_CHOICES):
            complaint.status = new_status

        complaint.save()
        return Response(AdminComplaintSerializer(complaint, context={'request': request}).data)

    def put(self, request, pk):
        """Edit subject and description of an existing complaint."""
        err = self._check_staff(request)
        if err:
            return err
        complaint = self._get(pk)
        subject = (request.data.get('subject') or '').strip()
        description = (request.data.get('description') or '').strip()

        if not subject:
            return Response({'subject': 'Subject is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not description:
            return Response({'description': 'Description is required.'}, status=status.HTTP_400_BAD_REQUEST)

        complaint.subject = subject
        complaint.description = description
        complaint.save(update_fields=['subject', 'description', 'updated_at'])
        return Response(AdminComplaintSerializer(complaint, context={'request': request}).data)

    def delete(self, request, pk):
        err = self._check_staff(request)
        if err:
            return err
        complaint = self._get(pk)
        complaint.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
