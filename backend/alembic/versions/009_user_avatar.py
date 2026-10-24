"""Foto de perfil del usuario: clave del archivo en el almacenamiento."""

from alembic import op

revision = "009_user_avatar"
down_revision = "008_offer_road_eta"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN avatar_key TEXT;")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN avatar_key;")
