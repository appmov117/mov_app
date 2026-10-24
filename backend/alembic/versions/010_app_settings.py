"""Ajustes que el administrador cambia desde el panel, como la liga de pago de la membresía."""

from alembic import op

revision = "010_app_settings"
down_revision = "009_user_avatar"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE app_settings;")
