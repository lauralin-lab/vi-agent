"""Drop password_hash column from users table.

Firebase Authentication replaces email/password auth.
No legacy users exist — safe to remove.

Revision ID: v5_drop_password_hash
Revises: v4_firebase_auth
"""

from typing import Sequence, Union

from alembic import op

revision: str = 'v5_drop_password_hash'
down_revision: Union[str, Sequence[str], None] = 'v4_firebase_auth'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('users', 'password_hash')


def downgrade() -> None:
    import sqlalchemy as sa
    op.add_column('users', sa.Column('password_hash', sa.String(255), nullable=True))
