from rest_framework import serializers
from .models import Translation, LanguageAccessSetting

class TranslationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Translation
        fields = ['slug', 'text_en', 'text_ur']

class LanguageAccessSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = LanguageAccessSetting
        fields = ['urdu_enabled', 'allowed_user_types']
