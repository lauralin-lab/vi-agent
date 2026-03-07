"""Add missing metadata column to sessions table.

The initial migration included this column, but some deployments
were bootstrapped before alembic was introduced, so the column
may be absent.

Revision ID: v5_add_sessions_metadata
Revises: v5_drop_password_hash
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'v5_add_sessions_metadata'
down_revision: Union[str, Sequence[str], None] = 'v5_drop_password_hash'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = 'sessions' AND column_name = 'metadata'"
    ))
    if result.fetchone() is None:
        op.add_column('sessions', sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('sessions', 'metadata')
