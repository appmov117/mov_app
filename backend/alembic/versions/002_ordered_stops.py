"""Paradas ordenadas y progreso manual del conductor."""

from alembic import op

revision = "002_ordered_stops"
down_revision = "001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE ride_requests
            ADD COLUMN stops JSONB NOT NULL DEFAULT '[]'::jsonb;
        ALTER TABLE rides
            ADD COLUMN current_stop_index INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN stop_arrived BOOLEAN NOT NULL DEFAULT FALSE;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE rides DROP COLUMN IF EXISTS stop_arrived, DROP COLUMN IF EXISTS current_stop_index;
        ALTER TABLE ride_requests DROP COLUMN IF EXISTS stops;
        """
    )
