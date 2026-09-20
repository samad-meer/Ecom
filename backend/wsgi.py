"""
WSGI entry point for cPanel / LiteSpeed / Passenger hosts.

Some host configurations look for `wsgi.py` in the application root,
while others look for `passenger_wsgi.py`.

This file ensures that Passenger finds the `application` callable regardless
of which startup filename is configured in cPanel -> Setup Python App.
"""
import os
import sys

APP_ROOT = os.path.dirname(os.path.abspath(__file__))
if APP_ROOT not in sys.path:
    sys.path.insert(0, APP_ROOT)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

from core.wsgi import application  # noqa: E402, F401
