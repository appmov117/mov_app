"""Calificaciones bidireccionales pasajero ↔ conductor."""

from alembic import op

revision = "003_bidirectional_ratings"
down_revision = "002_ordered_stops"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE ratings
            ADD COLUMN author_role TEXT NOT NULL DEFAULT 'passenger'
            CHECK (author_role IN ('passenger', 'driver'));
        ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_ride_id_key;
        ALTER TABLE ratings ADD CONSTRAINT ratings_ride_author_unique UNIQUE (ride_id, author_role);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM ratings a USING ratings b
        WHERE a.ctid < b.ctid AND a.ride_id = b.ride_id;
        ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_ride_author_unique;
        ALTER TABLE ratings DROP COLUMN IF EXISTS author_role;
        ALTER TABLE ratings ADD CONSTRAINT ratings_ride_id_key UNIQUE (ride_id);
        """
    )
