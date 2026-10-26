"""Cuentas eliminadas desde el panel."""

from alembic import op

revision = "015_deleted_accounts"
down_revision = "014_trip_extras"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE users
            DROP CONSTRAINT users_status_check,
            ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended', 'blocked', 'deleted'));
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE users SET status = 'blocked' WHERE status = 'deleted';
        ALTER TABLE users
            DROP CONSTRAINT users_status_check,
            ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended', 'blocked'));
        """
    )
