"""v7: settings table

Revision ID: v7_settings
Revises: v6_invite_codes
"""

import sqlalchemy as sa
from alembic import op

revision = "v7_settings"
down_revision = "v6_invite_codes"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "settings",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("note", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # Insert default settings
    op.execute(
        "INSERT INTO settings (key, value, note) VALUES "
        "('invite_required', 'false', '新用户注册是否强制需要邀请码')"
    )


def downgrade():
    op.drop_table("settings")
