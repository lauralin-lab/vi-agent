"""v6: invite codes system

Revision ID: v6_invite_codes
Revises: v5_add_sessions_metadata
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "v6_invite_codes"
down_revision: Union[str, Sequence[str], None] = "v5_add_sessions_metadata"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "invite_codes",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("creator_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("max_uses", sa.Integer(), nullable=True),
        sa.Column("used_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("note", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_invite_codes_code", "invite_codes", ["code"], unique=True)
    op.create_index("ix_invite_codes_creator_id", "invite_codes", ["creator_id"])

    op.create_table(
        "invite_records",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("invite_code_id", sa.UUID(), sa.ForeignKey("invite_codes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("inviter_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("invitee_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_invite_records_invite_code_id", "invite_records", ["invite_code_id"])
    op.create_index("ix_invite_records_inviter_id", "invite_records", ["inviter_id"])
    op.create_index("ix_invite_records_invitee_id", "invite_records", ["invitee_id"])


def downgrade() -> None:
    op.drop_table("invite_records")
    op.drop_table("invite_codes")
