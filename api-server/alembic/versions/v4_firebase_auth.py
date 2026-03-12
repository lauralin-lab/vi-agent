"""Add Firebase auth columns to users + create devices table

Revision ID: v4_firebase_auth
Revises: v4_oauth_tokens
Create Date: 2026-03-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'v4_firebase_auth'
down_revision: Union[str, Sequence[str], None] = 'v4_oauth_tokens'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Users table: add Firebase columns ---
    op.add_column('users', sa.Column('firebase_uid', sa.String(128), nullable=True))
    op.add_column('users', sa.Column('package_name', sa.String(128), nullable=True))
    op.add_column('users', sa.Column('sign_in_provider', sa.String(50), nullable=True))
    op.add_column('users', sa.Column('firebase_info', postgresql.JSONB(), server_default='{}', nullable=True))
    op.add_column('users', sa.Column('photo_url', sa.String(500), nullable=True))
    op.add_column('users', sa.Column('phone_number', sa.String(20), nullable=True))
    op.add_column('users', sa.Column('language', sa.String(10), server_default='en', nullable=True))
    op.add_column('users', sa.Column('app_version', sa.String(20), nullable=True))
    op.add_column('users', sa.Column('role', sa.String(20), server_default='user', nullable=True))
    op.add_column('users', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))

    # Make email nullable (social login users may not have email)
    op.alter_column('users', 'email', existing_type=sa.String(255), nullable=True)

    # Make password_hash nullable (Firebase users don't have passwords)
    op.alter_column('users', 'password_hash', existing_type=sa.String(255), nullable=True)

    # Indexes
    op.create_unique_constraint('uq_users_firebase_uid', 'users', ['firebase_uid'])
    op.create_index('ix_users_firebase_uid', 'users', ['firebase_uid'])
    op.create_index('ix_users_package_name', 'users', ['package_name'])

    # --- Devices table ---
    op.create_table(
        'devices',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('device_id', sa.String(128), nullable=False),
        sa.Column('package_name', sa.String(128), nullable=False),
        sa.Column('device_token', sa.String(512), nullable=True),
        sa.Column('gaid', sa.String(128), nullable=True),
        sa.Column('idfa', sa.String(128), nullable=True),
        sa.Column('idfv', sa.String(128), nullable=True),
        sa.Column('adjust_id', sa.String(128), nullable=True),
        sa.Column('app_instance_id', sa.String(128), nullable=True),
        sa.Column('appsflyer_id', sa.String(128), nullable=True),
        sa.Column('version', sa.String(20), nullable=True),
        sa.Column('store', sa.String(20), nullable=True),
        sa.Column('timezone', sa.Integer(), nullable=True),
        sa.Column('ip', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.String(500), nullable=True),
        sa.Column('token_valid', sa.Boolean(), server_default='true', nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('device_id', 'package_name', name='uq_device_package'),
    )
    op.create_index('ix_device_user_id', 'devices', ['user_id'])


def downgrade() -> None:
    # Drop devices table
    op.drop_index('ix_device_user_id', table_name='devices')
    op.drop_table('devices')

    # Remove Firebase columns from users
    op.drop_index('ix_users_package_name', table_name='users')
    op.drop_index('ix_users_firebase_uid', table_name='users')
    op.drop_constraint('uq_users_firebase_uid', 'users', type_='unique')

    op.alter_column('users', 'password_hash', existing_type=sa.String(255), nullable=False)
    op.alter_column('users', 'email', existing_type=sa.String(255), nullable=False)

    op.drop_column('users', 'updated_at')
    op.drop_column('users', 'role')
    op.drop_column('users', 'app_version')
    op.drop_column('users', 'language')
    op.drop_column('users', 'phone_number')
    op.drop_column('users', 'photo_url')
    op.drop_column('users', 'firebase_info')
    op.drop_column('users', 'sign_in_provider')
    op.drop_column('users', 'package_name')
    op.drop_column('users', 'firebase_uid')
