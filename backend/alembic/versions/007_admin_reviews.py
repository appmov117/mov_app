"""Quejas de conductores y revisión de documentos desde el panel."""

from alembic import op

revision = "007_admin_reviews"
down_revision = "006_ride_messages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE complaints
            ADD COLUMN author_role TEXT NOT NULL DEFAULT 'passenger'
            CHECK (author_role IN ('passenger', 'driver'));
        ALTER TABLE driver_documents
            ADD COLUMN reviewed_at TIMESTAMPTZ,
            ADD COLUMN reviewed_by UUID REFERENCES users(id),
            ADD COLUMN note TEXT;
        CREATE INDEX IF NOT EXISTS idx_ride_requests_created ON ride_requests (created_at);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX IF EXISTS idx_ride_requests_created;
        ALTER TABLE driver_documents DROP COLUMN note, DROP COLUMN reviewed_by, DROP COLUMN reviewed_at;
        ALTER TABLE complaints DROP COLUMN author_role;
        """
    )
