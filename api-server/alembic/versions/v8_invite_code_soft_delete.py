"""v8: add soft delete columns to invite_codes

Revision ID: v8_invite_code_soft_delete
Revises: v7_settings
"""

import sqlalchemy as sa
from alembic import op

revision = "v8_invite_code_soft_delete"
down_revision = "v7_settings"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "invite_codes",
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "invite_codes",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_column("invite_codes", "deleted_at")
    op.drop_column("invite_codes", "is_deleted")
